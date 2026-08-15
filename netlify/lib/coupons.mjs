// โค้ดส่วนลดแบบ Shopee — ตรรกะกลาง ใช้ร่วมกันระหว่าง /api/coupon กับ /api/orders
//
// เก็บที่ Netlify Blobs (store `gucut-coupon` · คีย์ `list`) ร้านสร้าง/แก้เองได้
// จากหลังร้าน ไม่ต้องแก้โค้ดหรือ env แล้ว
//
// ยังรองรับโค้ดลับใน env `COUPON_CODES` เหมือนเดิม (ของเก่าที่ตั้งไว้ยังใช้ได้)
// โค้ดจาก env จะไม่โชว์บนหน้าเว็บ ต้องพิมพ์เองเท่านั้น
//
// ⚠️ ตรวจโค้ดต้องทำที่เซิร์ฟเวอร์เท่านั้น ห้ามย้ายไปเบราว์เซอร์
//    ถึงโค้ดที่โชว์ให้กดเก็บจะไม่ลับ แต่เพดาน/โควตา/จำนวนครั้งต่อคน ปลอมได้ทันที
import { getStore } from "@netlify/blobs";

export const couponStore = () => getStore({ name: "gucut-coupon", consistency: "strong" });

const KEY = "list";
const up = (v) => String(v ?? "").trim().toUpperCase().slice(0, 40);

/** โค้ดที่ร้านสร้างเองจากหลังร้าน */
export async function readCoupons(s) {
  const list = await s.get(KEY, { type: "json" }).catch(() => null);
  return Array.isArray(list) ? list : [];
}

export const writeCoupons = (s, list) => s.setJSON(KEY, list);

/** โค้ดลับจาก env — รูปแบบเดิม ไม่โชว์บนหน้าเว็บ */
function envCoupons() {
  try {
    const list = JSON.parse(process.env.COUPON_CODES || "[]");
    return Array.isArray(list) ? list.map((x) => ({ ...x, visible: false, fromEnv: true })) : [];
  } catch {
    return [];   // JSON พิมพ์ผิด — ถือว่าไม่มีโค้ด ดีกว่าทำให้หน้าสั่งซื้อพัง
  }
}

export async function allCoupons(s) {
  return [...(await readCoupons(s)), ...envCoupons()];
}

/** ส่วนที่ให้ฝั่งลูกค้าเห็นได้ — ไม่มีตัวเลขโควตาที่ใช้ไปแล้ว */
export const publicCoupon = (c) => ({
  code: up(c.code),
  title: c.title || labelOf(c),
  label: labelOf(c),
  min: Number(c.min) || 0,
  until: c.until || null,
  memberOnly: !!c.memberOnly,
  left: c.quota ? Math.max(0, Number(c.quota) - Number(c.used || 0)) : null,
});

export function labelOf(c) {
  if (c.type === "percent") {
    const cap = c.max ? ` (สูงสุด ฿${Number(c.max).toLocaleString("th-TH")})` : "";
    return `ลด ${c.value}%${cap}`;
  }
  return `ลด ฿${Number(c.value).toLocaleString("th-TH")}`;
}

/**
 * ตรวจว่าโค้ดนี้ใช้กับยอดนี้ได้ไหม
 * คืน { ok, discount, label, error } — user ส่งมาได้ถ้าล็อกอินอยู่ (ไว้เช็คสิทธิ์ต่อคน)
 */
export function validate(c, subtotal, user) {
  if (!c) return { ok: false, error: "ไม่มีโค้ดนี้ หรือโค้ดหมดอายุแล้ว" };
  if (c.off) return { ok: false, error: "โค้ดนี้ปิดใช้ชั่วคราว" };

  if (c.until) {
    // หมดอายุตอนสิ้นวันตามเวลาไทย (UTC+7)
    const end = new Date(`${c.until}T23:59:59+07:00`).getTime();
    if (Number.isFinite(end) && Date.now() > end) return { ok: false, error: "โค้ดนี้หมดอายุแล้ว" };
  }
  if (c.memberOnly && !user) {
    return { ok: false, error: "โค้ดนี้สำหรับสมาชิก — เข้าสู่ระบบก่อนใช้ได้เลย" };
  }
  if (c.quota && Number(c.used || 0) >= Number(c.quota)) {
    return { ok: false, error: "โค้ดนี้ถูกใช้ครบจำนวนแล้ว" };
  }
  if (c.perUser && user) {
    const mine = Number(user.coupons?.[up(c.code)]?.used || 0);
    if (mine >= Number(c.perUser)) {
      return { ok: false, error: `โค้ดนี้ใช้ได้คนละ ${c.perUser} ครั้ง` };
    }
  }
  if (c.min && subtotal < Number(c.min)) {
    return { ok: false, error: `โค้ดนี้ใช้ได้เมื่อซื้อครบ ฿${Number(c.min).toLocaleString("th-TH")}` };
  }

  let discount =
    c.type === "percent"
      ? Math.floor((subtotal * Number(c.value)) / 100)
      : Math.floor(Number(c.value));
  if (c.type === "percent" && c.max) discount = Math.min(discount, Number(c.max));
  discount = Math.max(0, Math.min(discount, subtotal));   // ลดเกินยอดไม่ได้ และติดลบไม่ได้
  if (!discount) return { ok: false, error: "โค้ดนี้ใช้กับยอดนี้ไม่ได้" };

  return { ok: true, discount, label: labelOf(c), code: up(c.code) };
}

export const findCoupon = (list, code) => list.find((x) => up(x.code) === up(code));

/**
 * บันทึกว่าโค้ดถูกใช้ไปแล้วหนึ่งครั้ง — เรียกตอนออเดอร์สำเร็จเท่านั้น
 * (ไม่ใช่ตอนลูกค้ากดลองโค้ด ไม่งั้นโควตาหมดทั้งที่ยังไม่มีใครซื้อ)
 */
export async function markUsed(code, user, usersStore) {
  const s = couponStore();
  const list = await readCoupons(s);
  const c = findCoupon(list, code);
  if (c) {
    c.used = Number(c.used || 0) + 1;
    await writeCoupons(s, list).catch(() => {});
  }
  // นับของรายคนด้วย ถ้าลูกค้าล็อกอินอยู่
  if (user && usersStore) {
    const key = `u/${user.phone}`;
    const u = await usersStore.get(key, { type: "json" }).catch(() => null);
    if (u) {
      u.coupons = u.coupons || {};
      const cur = u.coupons[up(code)] || {};
      u.coupons[up(code)] = { ...cur, used: Number(cur.used || 0) + 1, at: Date.now() };
      await usersStore.setJSON(key, u).catch(() => {});
    }
  }
}
