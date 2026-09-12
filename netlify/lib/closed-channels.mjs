// ── รายชื่อ "ช่องทางขายที่ปิดไปแล้ว" — แหล่งเดียวของความจริง ────────────────────────
//
// ที่มา: ท่านประธานแจ้ง 12 ก.ย. 2569 ว่าร้าน **ZAMA** (TikTok/Lazada/Shopee) ไม่ได้ใช้แล้ว
// ⇒ ออเดอร์ของช่องทางที่ปิด **จะไม่มีวันถูกส่ง** แต่มันนั่งอยู่ในกอง "รอจัดส่ง" ตลอดกาล
//   วัดจริง: กองรอจัดส่งทั้งตาราง 10,765 ใบ = Lazada-gucut 8,526 · **ZAMA 2,237** · TIKTOK 2
//   ⇒ ทุกจอที่โชว์กองนี้กำลังนับใบที่ไม่มีใครส่งได้รวมอยู่ด้วย
//
// 🔴 **กติกาที่ห้ามละเมิด — ทุกข้อมีเหตุจากของจริง**
//   ① **ที่เก็บมีที่เดียว และจอห้ามเก็บรายชื่อของตัวเอง** (CEO ย้ำว่าข้อนี้สำคัญที่สุด)
//      เพราะมันคือกับดักเดียวกับบั๊กปุ่มหมวด POS เช้าวันเดียวกัน: กติกาเดียวถูกเขียนสองที่
//      แล้ววันหนึ่งสองที่ไม่ตรงกัน โดยไม่มีอะไรฟ้อง
//   ② **เทียบชื่อช่องทางตรงตัวเท่านั้น ห้าม includes()/startsWith()**
//      "ZAMA Shopee" มีคำว่า "ZAMA" อยู่ข้างใน ⇒ ใช้ substring = ปิดสองช่องทางพร้อมกัน
//      โดยไม่ได้ตั้งใจ (กฎ no-substring-classification) · และของจริงยังมีชื่อที่ต่างกันแค่
//      ตัวพิมพ์ใหญ่-เล็กอยู่ด้วย ("LINE OA @gucut1" ยังขายอยู่ · "Line OA @gucut1" เงียบ 164 วัน)
//   ③ **ห้ามกรองแถวของช่องทางที่ปิดทิ้ง** ทำได้แค่แยกบรรทัด/ติดป้าย
//      ถ้าวันหนึ่งมีใบของร้านที่ปิดแล้วโผล่ใหม่ = มีอะไรผิดปกติหนัก ⇒ กรองทิ้งแล้วไม่มีใครเห็น
//   ④ **ห้ามให้อะไรเขียนรายชื่อนี้เองอัตโนมัติ** (CEO สั่ง) — ปิดร้านเป็นเรื่องธุรกิจที่
//      ท่านประธานเท่านั้นรู้ · ตัวตรวจ "เงียบนานแล้วยังไม่อยู่ในรายชื่อ" **เสนอได้ แต่คนต้องกดเอง**
//
// 🔴 **คีย์เป็น "ร้าน + ช่องทาง" ไม่ใช่ชื่อช่องทางเปล่า ๆ** (ตัดสิน 12 ก.ย. 2569)
//    หลักฐานจากของจริง — ชื่อช่องทางเดียวกันซ้ำข้ามร้านได้ และสองตัวมีชีวิตไม่เท่ากัน:
//      TIKTOK ของ **z1** ใบล่าสุด 11 ก.ย. 2569 — **ยังขายอยู่**
//      TIKTOK ของ **z2** ใบล่าสุด 22 ก.พ. 2569 — เงียบ 202 วัน
//    ⇒ ถ้าคีย์เป็นชื่อช่องทางเปล่า ๆ วันที่ปิด TIKTOK ของ z2 **จะไปปิด TIKTOK ของ z1 ที่ยังขายอยู่ด้วย**
//       แล้วออเดอร์ที่ขายได้จริงจะถูกติดป้ายว่าเป็นของร้านที่ปิดแล้ว
//    ⚠️ **คนรอบหน้าจะเห็นคีย์ยาวแล้วอยากย่อให้สั้น** — ตัวอย่าง TIKTOK สองร้านข้างบนคือเหตุผล
//       ที่ห้ามย่อ · เก็บเป็นโครงซ้อน { "<ร้าน>": { "<ช่องทาง>": {...} } } เพื่อไม่ต้องมีตัวคั่น
//       (ตัวคั่นใด ๆ มีวันชนกับชื่อช่องทางจริง ซึ่งมีทั้งเว้นวรรค @ อิโมจิ และภาษาไทย)
//
// 🔴 **closedAt กับ recordedAt ต้องแยกกัน ห้ามยุบเป็นช่องเดียว** (CEO จับได้ 12 ก.ย. 2569)
//    ผมเกือบใส่ closedAt = วันนี้ ซึ่งเป็น **วันที่เรารู้** ไม่ใช่วันที่ร้านปิด
//    ถ้าใส่แบบนั้น: (ก) ได้ข้อเท็จจริงปลอมในฐานทันที (ข) กติกา "ใบลงวันที่หลังวันปิดต้องเตือน"
//    **จะไม่มีวันทำงาน** เพราะใบ ZAMA ทั้ง 5,958 ใบลงวันที่ก่อนหน้านั้นหมด
//    ⇒ ได้ตัวตรวจที่เขียวตลอดกาล ซึ่งเป็นคลาสที่ทีมนี้เจ็บมาหลายรอบ
//    ⇒ `closedAt: null` = **ยังไม่รู้วันปิด** และกติกาข้อนั้นต้องตอบว่า "ตรวจไม่ได้"
//       ห้ามตอบว่าผ่าน (ผลแปลไม่ได้ ≠ ผลว่าผ่าน)
import { getStore } from "@netlify/blobs";

const STORE = "gucut-coupon";   // ที่เดียวกับ botrules/marketing ที่ใช้ท่านี้อยู่แล้ว
const KEY = "closed-channels";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const store = () => getStore({ name: STORE, consistency: "strong" });

/** วันไทยวันนี้ */
export const thaiToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** อ่านรายชื่อทั้งก้อน — คืน {} เมื่อยังไม่เคยตั้ง
 *  🔴 **อ่านไม่ได้ต้องโยน ห้ามคืน {}** — ถ้ากลืน ทุกจอจะคิดว่า "ไม่มีช่องทางปิดเลย"
 *     แล้วใบของร้านที่ปิดจะกลับไปปนในกองที่ต้องลงมืออีกครั้งแบบเงียบ ๆ */
export async function loadClosedChannels() {
  const v = await store().get(KEY, { type: "json" });
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

export async function saveClosedChannels(map) {
  await store().setJSON(KEY, map);
}

/** ช่องทางของร้านนี้ปิดไปแล้วหรือยัง — **เทียบตรงตัวทั้งร้านและชื่อช่องทาง**
 *  ⚠️ ต้องส่ง store มาด้วยทุกครั้ง · ชื่อช่องทางเดียวกันต่างร้านคือคนละช่องทาง (ดูเหตุผลหัวไฟล์) */
export const isClosedChannel = (map, store, channel) =>
  Object.prototype.hasOwnProperty.call((map || {})[String(store ?? "")] || {}, String(channel ?? ""));

/** อ่านรายการของช่องทางหนึ่ง — คืน null ถ้าไม่อยู่ในรายชื่อ */
export const getClosedChannel = (map, store, channel) =>
  ((map || {})[String(store ?? "")] || {})[String(channel ?? "")] ?? null;

/** แผ่เป็นรายการแถว — ให้จอ/รายงานวนง่าย ๆ โดยไม่ต้องรู้โครงซ้อน */
export function listClosedChannels(map) {
  const out = [];
  for (const [store, chans] of Object.entries(map || {})) {
    for (const [channel, rec] of Object.entries(chans || {})) out.push({ store, channel, ...rec });
  }
  return out;
}

/** เพิ่ม/แก้รายการหนึ่งช่องทาง
 *  @param closedAt วันที่ร้านปิดจริง (YYYY-MM-DD) หรือ **null เมื่อยังไม่รู้**
 *  ⚠️ ไม่รับ undefined — ผู้เรียกต้องตัดสินใจว่า "รู้" หรือ "ไม่รู้" ให้ชัด */
export function putClosedChannel(map, { store, channel, closedAt, note = "", by = "", now = thaiToday() }) {
  const st = String(store ?? "").trim();
  const ch = String(channel ?? "").trim();
  /* 🔴 ไม่ส่งร้านมา = ตีกลับ ห้านเดาว่าเป็นร้านหลัก — ดูเหตุผล TIKTOK สองร้านที่หัวไฟล์ */
  if (!st) return { error: "ต้องระบุร้าน (store) — ชื่อช่องทางเดียวกันต่างร้านคือคนละช่องทาง" };
  if (!ch) return { error: "ต้องระบุชื่อช่องทาง (ตรงตัวเหมือนในข้อมูล)" };
  if (ch.length > 60) return { error: "ชื่อช่องทางยาวเกิน 60 ตัวอักษร" };
  if (closedAt !== null && !DAY.test(String(closedAt ?? ""))) {
    return { error: "closedAt ต้องเป็น YYYY-MM-DD หรือ null (null = ยังไม่รู้วันปิด) — ห้ามเว้นว่าง" };
  }
  const next = { ...(map || {}), [st]: { ...((map || {})[st] || {}) } };
  next[st][ch] = {
    closedAt: closedAt === null ? null : String(closedAt),
    recordedAt: now,                 // วันที่ "เราบันทึก" — คนละเรื่องกับวันที่ร้านปิด
    by: String(by ?? "").slice(0, 40),
    note: String(note ?? "").slice(0, 200),
  };
  return { map: next };
}

export function removeClosedChannel(map, store, channel) {
  const st = String(store ?? "").trim();
  const ch = String(channel ?? "").trim();
  if (!isClosedChannel(map, st, ch)) return { error: "ไม่มีช่องทางนี้ของร้านนี้ในรายชื่อ" };
  const next = { ...(map || {}), [st]: { ...((map || {})[st] || {}) } };
  delete next[st][ch];
  if (!Object.keys(next[st]).length) delete next[st];   // ร้านที่ไม่เหลือช่องทาง ไม่ต้องเก็บกุญแจเปล่า
  return { map: next };
}

/** กติกาข้อ ③ — ใบของช่องทางที่ปิด ลงวันที่ "หลัง" วันปิดหรือเปล่า
 *  คืนสามค่า **ห้ามยุบเป็นสอง**:
 *    "after-closed" = ใบใหม่กว่าวันปิด ⇒ ผิดปกติหนัก ต้องเตือนเสียงดัง
 *    "before-closed" = ปกติ (ใบเก่ากว่าวันปิด)
 *    "unknown" = **ยังไม่รู้วันปิด ⇒ ตรวจไม่ได้** ห้ามตีความว่าผ่าน */
export function orderVsClosed(rec, orderDate) {
  const closed = rec?.closedAt;
  if (!closed || !DAY.test(String(closed))) return "unknown";
  if (!DAY.test(String(orderDate ?? ""))) return "unknown";
  return String(orderDate) > String(closed) ? "after-closed" : "before-closed";
}
