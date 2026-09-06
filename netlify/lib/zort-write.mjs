// เขียนข้อมูลกลับเข้า ZORT — จอในหลังร้านตัวใหม่ใช้ตัวนี้แทนการเขียนลงคลังเงาตรง ๆ
//
// ⚠️ **ทำไมเขียนเข้า ZORT ไม่เขียนลง D1 ตรง ๆ** (ตัดสินใจ 6 ก.ย. 2569 · CEO + คุณส้ม)
//    ระยะนี้ ZORT ยังเป็น "ตัวจริง" ส่วนคลังเงาเป็นกระจกที่ซิงก์ทับทุกครึ่งชั่วโมง
//    ⇒ เขียนลง D1 เอง = รอบซิงก์ถัดไปเขียนทับ **ข้อมูลหายเงียบ ๆ ไม่มีอะไรฟ้อง**
//    เขียนเข้า ZORT แล้วให้กระจกดูดกลับมา = ไม่มีทางแตกสองฝั่ง
//    และวันสับสวิตช์แค่เปลี่ยนปลายทางการเขียนในไฟล์นี้ไฟล์เดียว **จอไม่ต้องแก้เลย**
//
// 📌 เส้นที่ยิงของจริงตรวจแล้ว 6 ก.ย. 2569 (ส่ง {} เปล่าไม่มีคีย์ ⇒ ไม่ได้สร้างอะไร)
//    เกณฑ์: ตอบ `resCode 100 Invalid API` = เส้นมีจริงแค่ไม่มีสิทธิ์ · ตอบ 404 = ไม่มีเส้นนั้น
//    ✅ Product/AddProduct · Product/UpdateProduct · PurchaseOrder/AddPurchaseOrder
//    ❌ PurchaseOrder/UpdatePurchaseOrder · Order/AddReturnOrder · SalePage/AddSalePage
//    ⇒ สองอย่างหลัง **ZORT ไม่เปิด API ให้** ไม่ใช่ "เรายังไม่ได้ทำ" — คนละเรื่อง ห้ามเขียนรวมกัน
//
// ⚠️ **ทุกคำสั่งต้องมี `ref` เสมอ** — กติกาเดียวกับ `move=1` ของคลังเงา
//    `ref` คือ "ใบนี้คือใบไหน" ใช้กันยิงซ้ำ · ไม่มี ref = กดสองครั้งได้ของสองรอบ
//    ⚠️ และต้องแยก `added` กับ `duplicate` ให้ขาด **ห้ามแกล้งขึ้นเขียวทั้งคู่**
//       (บทเรียนจากตัวบันทึกของเข้า-ออก: คนไม่เชื่อว่าบันทึกติดจะกรอกใบใหม่ ⇒ ของเข้าซ้ำ)
import { getStore } from "@netlify/blobs";

const BASE = "https://open-api.zortout.com/v4";
const STORE = "gucut-coupon"; // ถังเดิมของค่าตั้งหลังร้าน — ไม่สร้างถังใหม่เพื่อของเล็ก ๆ
const REF_PREFIX = "zwrite/";

/* ⚠️ **ห้ามแปลงค่าที่อ่านไม่ออกเป็น 0** (ผู้ตรวจจับได้ 6 ก.ย. 2569)
    `null` · `""` · `"1,200"` (มีลูกน้ำ) ล้วนกลายเป็น 0 เงียบ ๆ ⇒ สินค้าขึ้น ZORT ราคา ฿0
    และแก้ทีหลังไม่ได้เพราะ ZORT ไม่เปิด Update API ให้ใบซื้อ
    ⇒ คืน null เมื่ออ่านไม่ออก แล้วให้ผู้เรียกตีกลับเป็น error */
const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
const txt = (v, n = 200) => String(v ?? "").trim().slice(0, n);
/* ref ต้องสะอาดพอจะเอาไปเป็นคีย์ Blobs — อักขระแปลกทำให้ตัวจดล้ม
   แล้วจะไปโผล่เป็น "ZORT เข้าแล้วแต่ระบบจำไม่ได้" ซึ่งชวนให้กดซ้ำ */
const cleanRef = (v) => txt(v, 120).replace(/[^A-Za-z0-9._:-]/g, "-");

function creds() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME || !ZORT_APIKEY || !ZORT_APISECRET) return null;
  return {
    storename: ZORT_STORENAME,
    apikey: ZORT_APIKEY,
    apisecret: ZORT_APISECRET,
    "content-type": "application/json",
  };
}

/**
 * ยิงคำสั่งเขียนไป ZORT
 * ⚠️ **ZORT ตอบ HTTP 200 เสมอ แล้วบอกความผิดพลาดใน `resCode`**
 *    เช็ค status อย่างเดียว = ขึ้นเขียวทุกครั้งแม้ของจริงไม่ได้บันทึก (คลาสเดียวกับ TikTok)
 *    resCode "200" = สำเร็จ · อย่างอื่นคือไม่สำเร็จ ต้องคืนข้อความจริงกลับไปให้คนอ่าน
 */
async function zortPost(path, body) {
  const headers = creds();
  if (!headers) return { ok: false, error: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  let r;
  try {
    r = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000), // เหลือเวลาให้ตัวจดกันซ้ำเขียนต่อ (เพดานฟังก์ชัน 26 วิ)
    });
  } catch (e) {
    /* ⚠️ **หมดเวลา ≠ ไม่ถึง** — ZORT อาจบันทึกไปแล้วแต่ตอบช้า
        ของเดิมเขียนว่า "ยิงไม่ถึง" ซึ่งชวนให้กดซ้ำ ⇒ ของเข้าสองรอบ แก้คืนไม่ได้
        ⇒ แยกเป็นสถานะที่สาม "ไม่รู้ผล" แล้วบอกให้ไปตรวจใน ZORT ก่อน */
    const msg = String(e?.message || e);
    const timedOut = /timeout|abort/i.test(msg);
    return {
      ok: false,
      unknown: timedOut,
      error: timedOut
        ? "ยิง ZORT แล้วรอเกินเวลา — **ยังไม่รู้ว่าบันทึกหรือไม่** ไปตรวจใน ZORT ก่อนกดซ้ำ"
        : `ยิง ZORT ไม่ถึง: ${msg.slice(0, 120)}`,
    };
  }
  const d = await r.json().catch(() => null);
  if (!d) return { ok: false, error: `ZORT ตอบไม่ใช่ JSON (HTTP ${r.status})` };
  /* ⚠️ **ZORT วางรหัสผลไว้คนละที่แล้วแต่รุ่น** — ตัวส่งออเดอร์ที่วิ่งจริงมานาน
      (`functions/orders.mjs`) อ่าน `j.res.resCode` เป็นตัวแรก ส่วนที่ยิงตรวจ AddProduct
      เมื่อ 6 ก.ย. 2569 ได้ `resCode` ชั้นบนสุด ⇒ **ต้องอ่านให้ครบทุกรูปทรง**
      อ่านไม่เจอ = อย่าเดาว่าสำเร็จ · ห้ามใช้ `res.ok ? "200"` เป็นทางถอย
      เพราะ ZORT ตอบ 200 เสมอ ⇒ จะกลายเป็นเขียวหลอกทุกใบ */
  const code = String(d?.res?.resCode ?? d?.resCode ?? d?.rescode ?? "");
  const desc = txt(d?.res?.resDesc ?? d?.resDesc ?? d?.resdesc, 160);
  if (!code) {
    return {
      ok: false,
      unknown: true,
      error: "ZORT ตอบมาแต่หารหัสผลไม่เจอ — ยังไม่รู้ว่าบันทึกหรือไม่ ไปตรวจใน ZORT ก่อนกดซ้ำ",
    };
  }
  if (code !== "200") return { ok: false, error: `ZORT ปฏิเสธ (${code}): ${desc || "ไม่บอกเหตุผล"}` };
  return { ok: true, detail: d.detail ?? null };
}

/* ── ตัวกันยิงซ้ำ ──
   ⚠️ เก็บ "ref ที่เคยสำเร็จแล้ว" ไว้ **ก็ต่อเมื่อ ZORT ตอบสำเร็จจริง**
      จดก่อนยิง = ยิงไม่ผ่านแล้วกดใหม่จะถูกปฏิเสธว่าซ้ำ ทั้งที่ยังไม่เคยเข้าเลย
   ⚠️ ตัวกันนี้กันได้แค่ "กดปุ่มเดิมซ้ำ" — คนที่ไม่เชื่อว่าบันทึกติดแล้วกรอกใบใหม่
      ด้วย ref ใหม่ ยังเล็ดลอดได้เสมอ ⇒ ข้อความบนจอต้องบอกให้กดปุ่มเดิมซ้ำ ห้ามกรอกใบใหม่
      (ดู [[guard-stops-retry-not-reentry]]) */
const refStore = () => getStore({ name: STORE, consistency: "strong" });

/* ⚠️ **คีย์ต้องมีชนิดเอกสารด้วย ไม่ใช่ ref ล้วน** (ผู้ตรวจจับได้ 6 ก.ย. 2569)
    คลังเงาใช้ `UNIQUE(reason, ref, sku)` — มี reason อยู่ในคีย์โดยตั้งใจ
    ถ้าใช้ ref ล้วน: จอ "เพิ่มสินค้า" กับจอ "สร้างใบซื้อ" ส่ง ref เดียวกัน (เช่นเลขใบเดียวกัน)
    ตัวที่สองจะถูกตีว่าซ้ำ **โดยไม่เคยยิง ZORT เลย** แล้วจอขึ้นว่า "เคยบันทึกแล้ว"
    ⇒ ใบสั่งซื้อไม่เคยเกิดขึ้น แต่คนเชื่อว่าเข้าแล้ว — ข้อมูลหายเงียบสนิท */
const refKey = (kind, ref) => `${REF_PREFIX}${kind}/${ref}`;

/** คืน { state: "new" | "seen" | "unknown", info } — **สามสถานะ ห้ามยุบเหลือสอง**
 *  ⚠️ อ่าน Blobs ไม่ได้ ≠ ใบนี้ใหม่ · กลืนเป็น "ใหม่" = ตาข่ายเปิดตัวเองตอน Blobs ล่ม
 *     แล้วกดกี่ครั้งของก็เข้าครบทุกครั้ง (คลาส [[three-states-not-two]]) */
async function seenRef(kind, ref) {
  try {
    const info = await refStore().get(refKey(kind, ref), { type: "json" });
    return { state: info ? "seen" : "new", info: info ?? null };
  } catch {
    return { state: "unknown", info: null };
  }
}
async function markRef(kind, ref, info) {
  await refStore().setJSON(refKey(kind, ref), { ...info, at: new Date().toISOString() });
}

/** ผลของ "ยิงสำเร็จแล้วแต่จดกันซ้ำไม่ได้" — **ต้องยังเขียว** เพราะของเข้า ZORT ไปแล้วจริง
 *  ตอบแดงตรงนี้ = ชวนให้คนกดซ้ำ แล้วของเข้าสองรอบ (แก้คืนไม่ได้) */
async function markSafely(kind, ref, info) {
  try {
    await markRef(kind, ref, info);
    return null;
  } catch {
    return "บันทึกเข้า ZORT แล้ว แต่จดกันยิงซ้ำไม่สำเร็จ — **ห้ามกดซ้ำ** ไปตรวจใน ZORT ก่อน";
  }
}

/** เพิ่มสินค้าเข้า ZORT — จอ "เพิ่มสินค้า" ของหลังร้านเรียกตัวนี้
 *  ⚠️ ไม่ส่ง `confirm: true` มา = **โหมดซ้อม** คืนสิ่งที่จะส่งให้ดู ไม่ยิงจริง
 *     ครั้งแรกที่ใช้ต้องเป็นการกดโดยตั้งใจ เพราะ ZORT ไม่เปิด API ให้ลบสินค้าที่เพิ่มผิด
 */
export async function zortAddProduct(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const sku = txt(o.sku, 60);
  const name = txt(o.name, 200);
  if (!sku || !name) return { ok: false, error: "ต้องมีทั้ง sku และ name" };

  /* ⚠️ **ชื่อฟิลด์ยืนยันจากโค้ดที่วิ่งจริงในโปรเจกต์เท่านั้น** (ผู้ตรวจไล่ให้ 6 ก.ย. 2569)
      sellprice ✅ (core-products.mjs · zort-stock.mjs อ่านชื่อนี้)
      purchaseprice ✅ (ZORT เรียกราคาซื้อแบบนี้ — เดิมเขียน `cost` ซึ่งไม่มีที่ไหนในโปรเจกต์เลย
                        ⇒ ZORT จะ **เมินเงียบ ๆ ไม่ error** สินค้าขึ้นโดยไม่มีทุน)
      unittext ✅ (เดิมเขียน `unit` ซึ่งเป็นชื่อคอลัมน์ D1 ของเรา ไม่ใช่ของ ZORT)
      barcode · category **ยังยืนยันไม่ได้จากโค้ดในเครื่อง** ⇒ ส่งไปได้แต่ต้องตรวจของจริงรอบแรก */
  const body = { sku, name };
  for (const [key, field] of [["price", "sellprice"], ["cost", "purchaseprice"]]) {
    if (o[key] === undefined) continue;
    const n = numOrNull(o[key]);
    if (n === null) return { ok: false, error: `ช่อง ${key} ไม่ใช่ตัวเลข — ยังไม่ส่งเข้า ZORT` };
    body[field] = n;
  }
  if (txt(o.unit)) body.unittext = txt(o.unit, 40);
  if (txt(o.barcode)) body.barcode = txt(o.barcode, 60);
  if (txt(o.category)) body.category = txt(o.category, 80);
  if (txt(o.description)) body.description = txt(o.description, 500);

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ส่ง confirm:true เมื่อพร้อมบันทึกจริง" };

  const seen = await seenRef("product", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT ลองใหม่อีกครั้ง" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info,
      message: "ใบนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const r = await zortPost("Product/AddProduct", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("product", ref, { kind: "product", sku, name });
  return { ok: true, added: true, ref, sku, detail: r.detail, warn,
    message: `เพิ่มสินค้า ${sku} เข้า ZORT แล้ว` };
}

/** สร้างใบสั่งซื้อใน ZORT — จอ "สร้างรายการซื้อ" เรียกตัวนี้
 *  ⚠️ ไม่ส่ง `confirm: true` = โหมดซ้อม (ZORT ไม่เปิด Update/Delete ให้ใบซื้อ ⇒ ผิดแล้วแก้ไม่ได้)
 */
export async function zortAddPurchaseOrder(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return { ok: false, error: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด" };

  /* ⚠️ **ฟิลด์จำนวนในบรรทัดใบซื้อของ ZORT ชื่อ `number` ไม่ใช่ `amount`/`quantity`**
      มีบทเรียนจดไว้แล้วที่ core-purchases.mjs และตัวส่งออเดอร์ orders.mjs ก็ใช้ `number`
      ⚠️ และ `amount` ในโลกของ ZORT แปลว่า **มูลค่าเงิน** ไม่ใช่จำนวนชิ้น
      ⇒ ของเดิมส่ง `amount: qty` = ใบซื้อได้บรรทัดครบแต่จำนวน 0 ทุกบรรทัด และมูลค่าเพี้ยน
        โดยไม่มีอะไรฟ้อง (เจอก่อน deploy 6 ก.ย. 2569)
      ⚠️ ชื่อผู้ขายใช้ `customername` — `vendorname` ไม่มีที่ไหนในโปรเจกต์เลย */
  const list = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sku = txt(it?.sku, 60);
    const qty = numOrNull(it?.qty);
    const price = numOrNull(it?.price);
    if (!sku) return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มี sku` };
    if (qty === null || qty <= 0) return { ok: false, error: `บรรทัดที่ ${i + 1} จำนวนไม่ถูกต้อง` };
    // ⚠️ ราคาต้องตรวจด้วย — เดิมไม่ตรวจเลย ⇒ ใบทั้งใบราคา 0 ผ่านฉลุย แล้วแก้ทีหลังไม่ได้
    if (it?.price !== undefined && price === null)
      return { ok: false, error: `บรรทัดที่ ${i + 1} ราคาไม่ใช่ตัวเลข` };
    list.push({
      sku,
      name: txt(it?.name, 200),
      number: qty,
      ...(price === null ? {} : { pricepernumber: price }),
    });
  }

  const body = { list };
  if (txt(o.vendor)) body.customername = txt(o.vendor, 160);
  if (txt(o.note)) body.description = txt(o.note, 500);

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ส่ง confirm:true เมื่อพร้อมบันทึกจริง" };

  const seen = await seenRef("po", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT ลองใหม่อีกครั้ง" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info,
      message: "ใบนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const r = await zortPost("PurchaseOrder/AddPurchaseOrder", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("po", ref, { kind: "po", lines: list.length, vendor: txt(o.vendor, 60) });
  return { ok: true, added: true, ref, lines: list.length, detail: r.detail, warn,
    message: `สร้างใบสั่งซื้อ ${list.length} บรรทัดใน ZORT แล้ว` };
}

/** สร้างใบเสนอราคาใน ZORT — จอ "ใบเสนอราคา" (ปุ่มสร้าง) เรียกตัวนี้
 *
 *  ⚠️ **แก้ทีหลังไม่ได้เหมือนกัน** — ยิงตรวจ 6 ก.ย. 2569: `Quotation/UpdateQuotation` ตอบ **404**
 *     (ฝั่งจอเข้าใจว่าใบเสนอราคาแก้ได้จึงขอทำก่อน — ข้อสันนิษฐานนั้นไม่จริง บอกไปแล้ว)
 *     ⇒ ความเสี่ยงเท่าใบสั่งซื้อ ⇒ โหมดซ้อมเป็นค่าเริ่มต้นเหมือนกัน
 *  📌 ชื่อฟิลด์อ้างจากฝั่งอ่านจริง `core-purchases.mjs:listQuotations`
 *     (customername · customerphone · number · pricepernumber · reference)
 *     ⚠️ ฝั่งอ่านไม่ใช่ข้อพิสูจน์ของฝั่งเขียน — **ต้องยิงจริงหนึ่งใบแล้วดึงกลับมาดูก่อนเชื่อ**
 */
export async function zortAddQuotation(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return { ok: false, error: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด" };
  const customer = txt(o.customer, 160);
  if (!customer) return { ok: false, error: "ต้องมีชื่อลูกค้า" };

  const list = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sku = txt(it?.sku, 60);
    const qty = numOrNull(it?.qty);
    const price = numOrNull(it?.price);
    if (!sku) return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มี sku` };
    if (qty === null || qty <= 0) return { ok: false, error: `บรรทัดที่ ${i + 1} จำนวนไม่ถูกต้อง` };
    if (it?.price !== undefined && price === null)
      return { ok: false, error: `บรรทัดที่ ${i + 1} ราคาไม่ใช่ตัวเลข` };
    list.push({
      sku,
      name: txt(it?.name, 200),
      // ⚠️ ฟิลด์จำนวนของ ZORT ชื่อ `number` เหมือนใบซื้อ/ออเดอร์ ไม่ใช่ qty/amount
      number: qty,
      ...(price === null ? {} : { pricepernumber: price }),
    });
  }

  const body = { customername: customer, list };
  if (txt(o.phone)) body.customerphone = txt(o.phone, 40);
  if (txt(o.note)) body.description = txt(o.note, 500);
  if (txt(o.reference)) body.reference = txt(o.reference, 80);

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ส่ง confirm:true เมื่อพร้อมบันทึกจริง" };

  const seen = await seenRef("quotation", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT ลองใหม่อีกครั้ง" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info,
      message: "ใบนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const r = await zortPost("Quotation/AddQuotation", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("quotation", ref, { kind: "quotation", customer, lines: list.length });
  return { ok: true, added: true, ref, lines: list.length, detail: r.detail, warn,
    message: `สร้างใบเสนอราคาให้ ${customer} (${list.length} บรรทัด) แล้ว` };
}

/* ⚠️ **สิ่งที่ ZORT ไม่เปิด API ให้ — อย่าเขียนฟังก์ชันหลอกไว้ตรงนี้**
    การรับคืนสินค้า (ฝั่งซื้อ) · เซลเพจ · แก้ใบสั่งซื้อที่สร้างแล้ว
    ยิงตรวจแล้วได้ 404 ทั้งหมด ⇒ จอต้องเขียนว่า "ZORT ไม่เปิด API ให้"
    **ห้ามเขียนว่า "ยังไม่ได้ทำ"** — คนอ่านจะรอของที่ไม่มีวันมา
    (และห้ามใส่ปุ่มที่กดแล้วไม่เกิดอะไร — กติกาที่ตกลงกับฝั่งจอไว้) */
/* วิธียิงตรวจ (ทำซ้ำได้ · ไม่สร้างข้อมูลอะไรเลย):
     curl -X POST https://open-api.zortout.com/v4/<path> -H 'content-type: application/json' -d '{}'
   เกณฑ์อ่านผล — **สองอย่างนี้คนละความหมาย ห้ามยุบรวม**
     `{"resCode":"100","resDesc":"Invalid API"}` = **เส้นมีจริง** แค่เราไม่ได้ใส่คีย์
     HTTP 404 ตัวเปล่า                          = **ไม่มีเส้นนั้นในระบบ**
   ⚠️ อย่าเขียนผลลงจอด้วยมือ — ให้จอดึงจาก `/api/core?zortnoapi=1` เสมอ
      ไม่งั้นวันที่ ZORT เปิด API เพิ่ม ข้อความในจอจะกลายเป็นเท็จเงียบ ๆ
      (คลาส [[new-platform-needs-repo-sweep]] — เจอมาแล้ว 8 จุดในวันเดียว 6 ก.ย. 2569) */
export const ZORT_NO_API = [
  { what: "รับคืนสินค้า (ฝั่งซื้อ)", probe: "Order/AddReturnOrder → 404", at: "2026-09-06" },
  { what: "เซลเพจ / หน้าสั่งซื้อ", probe: "SalePage/AddSalePage → 404 · SalePage/GetSalePages → 404", at: "2026-09-06",
    note: "ไม่มีทั้งอ่านและเขียน" },
  { what: "แก้ใบสั่งซื้อที่สร้างแล้ว", probe: "PurchaseOrder/UpdatePurchaseOrder → 404", at: "2026-09-06",
    note: "สร้างได้อย่างเดียว สร้างผิดแล้วแก้ใน ZORT เอง" },
  { what: "กลุ่มลูกค้า", at: "2026-09-06",
    probe: "ContactGroup/GetContactGroups · Contact/GetContactGroups · Contact/GetGroups · Group/GetGroups → 404 ทั้งหมด" },
  { what: "ตัวแทนจำหน่าย / ดรอปชิป", probe: "Agent/GetAgents → 404 · Dropship/GetDropships → 404", at: "2026-09-06" },
];

/* ── เส้นที่ **มีจริง** แต่เรายังไม่ได้เขียนตัวเรียก ──
   ⚠️ แยกจากรายการข้างบนโดยตั้งใจ: อันบนคือ "ZORT ไม่เปิดให้" (รอไปก็ไม่มา)
      อันนี้คือ "เรายังไม่ได้ทำ" (ทำได้ทุกเมื่อ) — **สองอย่างนี้ต้องไม่อยู่ในกองเดียวกัน**
      คนอ่านจะได้รู้ว่าอันไหนควรรอ อันไหนควรสั่งให้ทำ */
export const ZORT_CAN_BUT_NOT_BUILT = [
  { what: "เพิ่ม/แก้ผู้ติดต่อ (ลูกค้า · คู่ค้า)", probe: "Contact/AddContact · Contact/UpdateContact → resCode 100", at: "2026-09-06" },
  { what: "สร้างใบเสนอราคา", probe: "Quotation/AddQuotation → resCode 100", at: "2026-09-06" },
  { what: "แก้ข้อมูลสินค้าที่มีอยู่แล้ว", probe: "Product/UpdateProduct → resCode 100", at: "2026-09-06" },
];
