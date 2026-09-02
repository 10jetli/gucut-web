// สะพานส่งเอกสารขายเข้า PEAK — หน้าที่สุดท้ายที่ ZORT ทำแทนร้านอยู่
//
// ร้านทำบัญชี/ภาษี/e-Tax ที่ PEAK อยู่แล้ว · ZORT เป็นแค่ท่อส่งยอดขายเข้าไป
// ตัด ZORT โดยไม่มีสะพานนี้ = งานบัญชีพังทันที ⇒ ต้องมีก่อนตัดเสมอ
//
// ⚠️ **ยังไม่เปิดใช้จนกว่าจะตั้ง env ครบ** (PEAK_CONNECT_ID · PEAK_CONNECT_KEY · PEAK_USER_TOKEN)
//    ไม่ตั้ง = ทุกฟังก์ชันคืน {skip} เงียบ ๆ ไม่ล้มงานอื่น — ตั้งใจให้ deploy ได้ก่อนมีคีย์
// ⚠️ **ต้องมีแพ็กเกจ PEAK PRO Plus ขึ้นไปถึงเปิด API ได้** (ราว 12,000 บาท/ปี)
//    ยังไม่ยืนยันว่าร้านมีแพ็กนี้ — ถามเจ้าของร้านไว้แล้ว 2 ก.ย. 2569
// ⚠️ **ห้ามยิงสร้างเอกสารจริงโดยไม่ได้สั่ง** เอกสารขายใน PEAK ผูกกับบัญชีและภาษี
//    ยิงผิด = ต้องตามยกเลิกทีละใบ · ตัวส่งจริงมีสวิตช์ PEAK_LIVE ของตัวเองแยกอีกชั้น
//
// วิธียืนยันตัวตน (จากเอกสารทางการ developers.peakaccount.com):
//   Time-Stamp     = เวลา UTC รูปแบบ yyyyMMddHHmmss
//   Time-Signature = HMAC-SHA1 ของ Time-Stamp โดยใช้ connectId เป็นกุญแจ
//   Client-Token   = ขอจาก POST /api/v1/ClientToken ด้วย connectId + connectKey
//   User-Token     = ออกจากหน้าเว็บ PEAK บอกว่าจะทำงานกับกิจการไหน
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const HOST = "https://api.peakaccount.com";

export function peakReady() {
  const { PEAK_CONNECT_ID, PEAK_CONNECT_KEY, PEAK_USER_TOKEN } = process.env;
  return !!(PEAK_CONNECT_ID && PEAK_CONNECT_KEY && PEAK_USER_TOKEN);
}

/** เปิดส่งของจริงหรือยัง — ต่อให้มีคีย์ครบก็ยังไม่ส่งจนกว่าจะตั้งสวิตช์นี้ */
export function peakLive() {
  return process.env.PEAK_LIVE === "1";
}

/** เวลา UTC yyyyMMddHHmmss ตามที่ PEAK กำหนด (ไม่ใช่เวลาไทย — อย่าเผลอ +7) */
function stamp() {
  return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function signature(ts) {
  return crypto
    .createHmac("sha1", process.env.PEAK_CONNECT_ID)
    .update(ts)
    .digest("hex");
}

const store = () =>
  getStore({
    name: "gucut-peak",
    consistency: "strong",
    ...(process.env.SITE_ID && process.env.NLF_CREDITS_TOKEN
      ? { siteID: process.env.SITE_ID, token: process.env.NLF_CREDITS_TOKEN }
      : {}),
  });

/** ขอ Client Token ใหม่ (เอกสารไม่ระบุอายุ — เก็บไว้ 30 นาทีแล้วขอใหม่ กันโดนปฏิเสธกลางทาง) */
async function newClientToken() {
  const ts = stamp();
  const res = await fetch(`${HOST}/api/v1/ClientToken`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Time-Stamp": ts,
      "Time-Signature": signature(ts),
    },
    body: JSON.stringify({
      peakClientToken: {
        connectId: process.env.PEAK_CONNECT_ID,
        connectKey: process.env.PEAK_CONNECT_KEY,
      },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json().catch(() => null);
  const t = data?.PeakClientToken ?? data?.peakClientToken;
  // ⚠️ PEAK ตอบ HTTP 200 แม้ตอนล้มเหลว — ต้องดู resCode ในตัว body เสมอ
  //    (กติกาเดียวกับ Shopee ที่ซ่อน error ไว้ในคำตอบที่ดูสำเร็จ)
  if (String(t?.resCode) !== "200" || !t?.token) {
    throw new Error(`PEAK ClientToken ไม่ผ่าน: ${t?.resCode ?? res.status} ${t?.resDesc ?? ""}`);
  }
  return t.token;
}

/** Client Token ที่ยังใช้ได้ — แชร์กันทุกคำขอ ไม่ขอใหม่ทุกครั้ง (นับเป็นทรานแซกชันของ PEAK) */
export async function clientToken() {
  const s = store();
  const saved = await s.get("client", { type: "json" }).catch(() => null);
  if (saved?.token && Date.now() - saved.at < 30 * 60 * 1000) return saved.token;
  const token = await newClientToken();
  await s.setJSON("client", { token, at: Date.now() });
  return token;
}

/** ยิง API ของ PEAK พร้อมหัวข้อมูลครบทั้ง 4 ตัว */
export async function peakCall(path, body) {
  const ts = stamp();
  const res = await fetch(`${HOST}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Time-Stamp": ts,
      "Time-Signature": signature(ts),
      "Client-Token": await clientToken(),
      "User-Token": process.env.PEAK_USER_TOKEN,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error(`PEAK ${path} ตอบไม่เป็น JSON (${res.status})`);
  return data;
}

/** ตรวจว่าเชื่อมต่อ PEAK ได้จริงไหม — ใช้กับหน้าสถานะระบบ ไม่สร้างเอกสารอะไร */
export async function peakStatus() {
  if (!peakReady()) {
    return { ready: false, note: "ยังไม่ได้ตั้ง PEAK_CONNECT_ID / PEAK_CONNECT_KEY / PEAK_USER_TOKEN" };
  }
  try {
    const token = await clientToken();
    return { ready: true, live: peakLive(), token: `${String(token).slice(0, 8)}…` };
  } catch (e) {
    return { ready: true, live: peakLive(), error: String(e?.message || e) };
  }
}

// ประเภทภาษีของ PEAK: 3 = ราคารวมภาษีแล้ว (ร้านขายปลีกออนไลน์ตั้งราคาแบบรวมภาษี)
// ⚠️ ตัวเลขนี้เปลี่ยนความหมายยอดทั้งใบ ห้ามเดา — ยืนยันกับบัญชีของร้านก่อนเปิดใช้จริง
const VAT_INCLUDED = 3;

/** แปลงออเดอร์ในคลังเงาเป็นใบแจ้งหนี้ตามรูปแบบ PEAK (ยังไม่ส่ง — แค่แปลง) */
export function toInvoice(order, items) {
  const day = String(order?.order_date ?? "").replace(/-/g, ""); // yyyyMMdd
  return {
    issuedDate: day,
    dueDate: day, // ขายปลีกเก็บเงินทันที ไม่มีเครดิต
    contactCode: String(order?.customer ?? "").slice(0, 60) || undefined,
    description: `${order?.channel ?? ""} ${order?.number ?? ""}`.trim(),
    products: (items ?? []).map((it) => ({
      code: String(it.sku ?? "").slice(0, 60) || undefined,
      name: String(it.name ?? "").slice(0, 200) || undefined,
      quantity: Number(it.qty) || 0,
      price: Number(it.qty) ? Number(it.amount) / Number(it.qty) : Number(it.amount) || 0,
      vatType: VAT_INCLUDED,
    })),
  };
}

/** ส่งใบแจ้งหนี้เข้า PEAK — ต้องเปิดสวิตช์ PEAK_LIVE ถึงจะยิงจริง
 *  ⚠️ ค่าปริยายคือ "ซ้อมอย่างเดียว" คืนสิ่งที่จะส่งให้ดูก่อน ไม่แตะบัญชีจริง */
export async function sendInvoices(invoices, { dryRun = true } = {}) {
  if (!invoices?.length) return { skip: "ไม่มีใบให้ส่ง" };
  // ⚠️ โหมดซ้อมต้องทำงานได้ **แม้ยังไม่มีคีย์** — การแปลงออเดอร์เป็นใบแจ้งหนี้
  //    เป็นส่วนที่ผิดง่ายที่สุด (ราคาต่อหน่วย · ประเภทภาษี · รหัสลูกค้า) และตรวจได้
  //    โดยไม่ต้องแตะ PEAK เลย · ให้บัญชีของร้านตรวจก่อนซื้อแพ็กเกจได้ด้วย
  if (dryRun || !peakLive() || !peakReady()) {
    const bad = invoices.filter(
      (v) => !v.issuedDate || !v.products?.length || v.products.some((p) => !(p.quantity > 0))
    );
    return {
      dryRun: true,
      ready: peakReady(),
      count: invoices.length,
      incomplete: bad.length,
      sample: invoices[0],
    };
  }
  const data = await peakCall("/api/v1/Invoices", { peakInvoices: { invoices } });
  const box = data?.peakInvoices ?? data?.PeakInvoices ?? {};
  const rows = box.invoices ?? [];
  return {
    sent: invoices.length,
    ok: rows.filter((r) => String(r?.resCode) === "200").length,
    failed: rows.filter((r) => String(r?.resCode) !== "200").map((r) => ({
      code: r?.resCode,
      desc: r?.resDesc,
    })),
  };
}
