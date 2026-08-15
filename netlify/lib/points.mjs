// แต้มสะสม — ตรรกะกลาง ใช้ร่วมกันระหว่าง /api/points กับ /api/orders
//
// เก็บแต้มไว้ในบัญชีลูกค้าเอง (store `gucut-users` · `u/<เบอร์>` · ช่อง points)
// ไม่ได้ฝากไว้กับแอปของใคร — ปิดบริการไหนแต้มลูกค้าก็ไม่หาย
// (บทเรียนจาก CWILL Loyalty บน Shopify ที่เก็บแต้มไว้ในแอปเขาเอง
//  ปิดร้าน Shopify เมื่อไหร่แต้มลูกค้าหายไปกับแอปทันที)
//
// กติกาที่ตั้งได้จากหลังร้าน เก็บที่ store `gucut-coupon` คีย์ `loyalty`
import { getStore } from "@netlify/blobs";

const SETTINGS_KEY = "loyalty";
const MAX_LOG = 60;              // เก็บประวัติล่าสุดกี่รายการต่อคน

export const DEFAULTS = {
  on: true,
  earnPer: 100,       // ซื้อครบกี่บาท = 1 แต้ม
  redeemValue: 1,     // 1 แต้ม = กี่บาท
  minRedeem: 50,      // ต้องมีอย่างน้อยกี่แต้มถึงแลกได้
  maxPercent: 20,     // แลกได้ไม่เกินกี่ % ของค่าสินค้า (กันแลกทั้งบิล)
};

const settingsStore = () => getStore({ name: "gucut-coupon", consistency: "strong" });

export async function readLoyalty() {
  try {
    const s = await settingsStore().get(SETTINGS_KEY, { type: "json" });
    return { ...DEFAULTS, ...(s || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function writeLoyalty(next) {
  const s = settingsStore();
  const cur = await readLoyalty();
  const merged = {
    on: next.on !== false,
    earnPer: Math.max(1, Number(next.earnPer) || cur.earnPer),
    redeemValue: Math.max(0.1, Number(next.redeemValue) || cur.redeemValue),
    minRedeem: Math.max(0, Number(next.minRedeem) ?? cur.minRedeem),
    maxPercent: Math.min(100, Math.max(1, Number(next.maxPercent) || cur.maxPercent)),
  };
  await s.setJSON(SETTINGS_KEY, merged);
  return merged;
}

/** แต้มที่จะได้จากยอดค่าสินค้า (ไม่รวมค่าส่ง — ค่าส่งไม่ใช่ยอดขาย) */
export const earnFrom = (subtotal, cfg) =>
  cfg.on ? Math.floor(Math.max(0, subtotal) / cfg.earnPer) : 0;

/**
 * แลกแต้มได้กี่บาทกับยอดนี้ — คิดฝั่งเซิร์ฟเวอร์เสมอ
 * คืน { points, discount, error }  (points = แต้มที่จะถูกหักจริง)
 */
export function redeemPlan(want, balance, subtotal, cfg) {
  if (!cfg.on) return { points: 0, discount: 0, error: "ระบบแต้มปิดอยู่" };
  const ask = Math.max(0, Math.floor(Number(want) || 0));
  if (!ask) return { points: 0, discount: 0 };
  if (balance < cfg.minRedeem) {
    return { points: 0, discount: 0, error: `ต้องมีอย่างน้อย ${cfg.minRedeem} แต้มถึงแลกได้` };
  }
  const cap = Math.floor((subtotal * cfg.maxPercent) / 100);       // เพดานตาม % ของบิล
  const use = Math.min(ask, balance, Math.floor(cap / cfg.redeemValue));
  const discount = Math.min(Math.floor(use * cfg.redeemValue), cap, subtotal);
  if (discount <= 0) return { points: 0, discount: 0, error: "ยอดนี้ยังแลกแต้มไม่ได้" };
  return { points: use, discount };
}

/** อ่านบัญชีจากเบอร์ (คืน null ถ้าไม่มีบัญชี — ลูกค้าที่ซื้อโดยไม่ล็อกอิน) */
export const readUser = (usersStore, phone) =>
  usersStore.get(`u/${phone}`, { type: "json" }).catch(() => null);

/**
 * บวก/ลบแต้ม พร้อมจดประวัติ — n เป็นบวกคือได้แต้ม ลบคือใช้แต้ม
 * คืนยอดแต้มใหม่ หรือ null ถ้าไม่มีบัญชีนั้น
 */
export async function addPoints(usersStore, phone, n, note, orderId) {
  const key = `u/${phone}`;
  const u = await usersStore.get(key, { type: "json" }).catch(() => null);
  if (!u) return null;
  const before = Number(u.points || 0);
  const after = Math.max(0, before + Math.round(n));
  u.points = after;
  u.pointLog = [
    { n: Math.round(n), at: Date.now(), note: String(note || "").slice(0, 80), o: orderId || null },
    ...(Array.isArray(u.pointLog) ? u.pointLog : []),
  ].slice(0, MAX_LOG);
  await usersStore.setJSON(key, u);
  return after;
}
