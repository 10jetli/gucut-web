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
/* ตัวแปลงเลขแบบไม่พลาดเป็น NaN — ใช้ใน zortDocCoverage
   ⚠️ เพิ่ม 7 ก.ย. 2569 หลังยิงจริงแล้วเจอ ReferenceError "num is not defined"
   (โรคเดียวกับ waitUntil เมื่อเช้า: ชื่อที่ไม่มีอยู่จริง build ผ่านฉลุย พังตอนรัน
   — รอบนี้ตาข่าย "ยิงของจริงหลัง deploy" จับเองก่อนมีใครใช้จอ) */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
const txt = (v, n = 200) => String(v ?? "").trim().slice(0, n);
/* ref ต้องสะอาดพอจะเอาไปเป็นคีย์ Blobs — อักขระแปลกทำให้ตัวจดล้ม
   แล้วจะไปโผล่เป็น "ZORT เข้าแล้วแต่ระบบจำไม่ได้" ซึ่งชวนให้กดซ้ำ */
/* 🔴 **ref ที่เป็นภาษาไทยจะยุบเป็นขีดทั้งหมด ⇒ ใบคนละใบกลายเป็นใบเดียวกัน**
    (จับได้ 6 ก.ย. 2569 ตอนยิงโหมดซ้อมครั้งแรก — `willSend.ref` ออกมาเป็น `------------------`)
    ตัวกันยิงซ้ำใช้ ref เป็นกุญแจ ⇒ ใบเสนอราคาสองใบที่ชื่อไทยยาวเท่ากัน
    จะถูกตีว่า **ซ้ำ** ⇒ **ใบที่สองไม่เคยถูกสร้าง แต่จอขึ้นว่า "เคยบันทึกแล้ว"**
    = ข้อมูลหายเงียบสนิท และคนใช้จะเชื่อว่าบันทึกติดแล้ว
    ⚠️ แก้แบบไม่เปลี่ยนพฤติกรรมของ ref ที่เป็นอังกฤษล้วน (ของเดิมที่เคยจดไว้ต้องยังตรงกัน)
       ⇒ ต่อท้ายด้วยลายนิ้วมือของข้อความต้นฉบับ **เฉพาะเมื่อมีตัวอักษรถูกแทนที่จริง** */
const cleanRef = (v) => {
  const raw = txt(v, 120);
  const safe = raw.replace(/[^A-Za-z0-9._:-]/g, "-");
  if (safe === raw) return safe;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  return `${safe.slice(0, 100)}~${(h >>> 0).toString(36)}`;
};

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
    /* รูปสินค้าต้องส่งแบบ multipart ⇒ ห้ามตั้ง content-type เอง ให้ fetch ใส่ boundary ให้ */
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const h = { ...headers };
    if (isForm) delete h["content-type"];
    r = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: h,
      body: isForm ? body : JSON.stringify(body),
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
 *     ครั้งแรกที่ใช้ต้องเป็นการกดโดยตั้งใจ · ลบได้ด้วย DeleteProduct (เอกสาร V4 · แก้ข้อความเดิม 14 ก.ย. 2569 ที่เขียนว่าไม่มี API ลบ)
 *     แต่ต้องรู้ id ของ ZORT และลบแล้วเอาคืนไม่ได้ ⇒ ใส่ให้ถูกตั้งแต่แรกดีที่สุด
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
  /* ✅ **ยืนยันกับเอกสารทางการ ZORT API V4 แล้ว** (developers.zortout.com/api-reference/product · 14 ก.ย. 2569 · งานกระดาน t_mu0tx2wj)
      AddProduct: name* · sku* · description · sellprice (String) · purchaseprice (String) · sell_vat_status (Int) ·
      purchase_vat_status (Int) · barcode · stock (String) · unittext · weight/width/length/height (String) · tag (String Array) ·
      category · producttype (Int) · properties
      🔴 แก้ของเดิม: เดิมส่ง sellprice/purchaseprice เป็น **ตัวเลข** ทั้งที่เอกสารกำหนด String — ZORT อาจรับได้ แต่ยังไม่เคยยิงพิสูจน์
         ⇒ ส่งตามเอกสาร ไม่พึ่งว่า ZORT จะยอมเดาชนิดให้
      🔴 **ไม่ส่ง `stock` (สต็อกตั้งต้น) โดยตั้งใจ** — สต็อกที่เกิดตอนสร้างสินค้าไม่มีเอกสารรองรับ (ไม่มีใบซื้อ/ใบปรับยอด)
         กระจกคลังเงาจะเห็นยอดโผล่ขึ้นมาเฉย ๆ ⇒ รับของเข้าต้องผ่าน ?poreceive หรือปรับยอดใน ZORT
      ⚠️ ไม่ส่ง producttype/properties — เอกสารไม่บอกค่าที่รับ ห้ามเดา */
  const body = { sku, name };
  for (const [key, field] of [["price", "sellprice"], ["cost", "purchaseprice"],
    ["weight", "weight"], ["width", "width"], ["length", "length"], ["height", "height"]]) {
    if (o[key] === undefined || o[key] === "") continue;
    const n = numOrNull(o[key]);
    if (n === null || n < 0) return { ok: false, error: `ช่อง ${key} ต้องเป็นตัวเลขไม่ติดลบ — ยังไม่ส่งเข้า ZORT` };
    body[field] = String(n);
  }
  for (const [key, field, max] of [["vat", "sell_vat_status", 3], ["purchaseVat", "purchase_vat_status", 2]]) {
    if (o[key] === undefined || o[key] === "") continue;
    const v = Number(o[key]);
    if (!Number.isInteger(v) || v < 0 || v > max)
      return { ok: false, error: `${key} ต้องเป็นเลขจำนวนเต็ม 0-${max} (${field} ตามเอกสาร)` };
    body[field] = v;
  }
  if (txt(o.unit)) body.unittext = txt(o.unit, 40);
  if (txt(o.barcode)) body.barcode = txt(o.barcode, 60);
  if (txt(o.category)) body.category = txt(o.category, 80);
  if (txt(o.description)) body.description = txt(o.description, 500);
  if (Array.isArray(o.tags)) {
    const tag = o.tags.map((t) => txt(t, 40)).filter(Boolean).slice(0, 20);
    if (tag.length) body.tag = tag;
  }
  const warnings = [];
  if (o.stock !== undefined)
    warnings.push("ไม่ส่งสต็อกตั้งต้นเข้า ZORT โดยตั้งใจ — รับของเข้าผ่านใบซื้อ (?poreceive) หรือปรับยอดใน ZORT เพื่อให้มีเอกสารรองรับ");

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body, ...(warnings.length ? { warnings } : {}),
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

/** สร้างรายการขายเข้า ZORT จริง (sale-create "ขายจริง") — ต่างจาก createSale ใน pos.mjs ที่เขียนลงคลังเงาอย่างเดียว
 *  ⚠️ **ชื่อช่องจากเอกสารทางการ ZORT API V4** (developers.zortout.com/api-reference/order · อ่าน 14 ก.ย. 2569)
 *     บังคับ: number · amount (Net) · list[{sku, name, number, pricepernumber, totalprice}]
 *     ไม่บังคับ: orderdate (yyyy-MM-dd) · status (Pending|Success) · reference · description · saleschannel ·
 *                warehousecode · isCOD · shippingamount · discount (String เช่น "50.00") ·
 *                paymentamount + paymentmethod + paymentdate (yyyy-MM-dd HH:mm) · customer*
 *  🔴 **เงินคิดที่ท่อเสมอ ไม่เชื่อตัวเลขจากจอ** (กฎ zort-sends-all-money-fields: ZORT ไม่ derive ให้บนใบเสนอราคา)
 *     totalprice = จำนวน × ราคา · amount = รวมบรรทัด − ส่วนลด + ค่าส่ง · บรรทัดไม่มีราคา = ปฏิเสธทั้งใบ
 *     (วัดจริง 14 ก.ย.: ออเดอร์เว็บ 3 ใบที่ไม่ส่ง totalprice ZORT คิดยอดบรรทัดให้ — แต่เอกสารระบุว่าบังคับ จึงส่งเสมอ)
 *  ⚠️ ออเดอร์เว็บ (orders.mjs) ส่งส่วนลดเป็น `discountamount` · เอกสารเขียน `discount` (String) — ที่นี่ยึดเอกสาร **ยังไม่ได้ยิงยืนยัน**
 *  ⚠️ **ยังไม่เคยยิงจริง** · โหมดซ้อมเป็นค่าเริ่มต้น · ต้อง confirm:true + ref · งานกระดาน t_mu0m97e5/sale-create */
export async function zortAddSale(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const number = txt(o.number, 60) || ref;
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return { ok: false, error: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด" };

  const r2 = (n) => Math.round(n * 100) / 100;
  const list = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sku = txt(it?.sku, 60);
    const name = txt(it?.name, 200);
    const qty = numOrNull(it?.qty);
    const price = numOrNull(it?.price);
    if (!sku) return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มี sku` };
    if (!name) return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มีชื่อสินค้า (ZORT บังคับ name)` };
    if (qty === null || qty <= 0) return { ok: false, error: `บรรทัดที่ ${i + 1} จำนวนไม่ถูกต้อง` };
    if (price === null || price < 0)
      return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มีราคา — ZORT บังคับ และห้ามเดาเป็นศูนย์` };
    list.push({ sku, name, number: qty, pricepernumber: price, totalprice: r2(qty * price) });
  }
  const discount = o.discount === undefined ? 0 : numOrNull(o.discount);
  const shipping = o.shipping === undefined ? 0 : numOrNull(o.shipping);
  if (discount === null || discount < 0) return { ok: false, error: "ส่วนลดต้องเป็นตัวเลขไม่ติดลบ (บาท)" };
  if (shipping === null || shipping < 0) return { ok: false, error: "ค่าส่งต้องเป็นตัวเลขไม่ติดลบ" };
  const linesTotal = r2(list.reduce((s, l) => s + l.totalprice, 0));
  if (discount > linesTotal) return { ok: false, error: `ส่วนลด ${discount} มากกว่ายอดสินค้า ${linesTotal}` };
  const amount = r2(linesTotal - discount + shipping);

  const body = {
    number, amount, list,
    orderdate: DAY_RE.test(String(o.day)) ? o.day : new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10),
    status: o.status === "Success" ? "Success" : "Pending",
  };
  if (discount > 0) body.discount = discount.toFixed(2);
  if (shipping > 0) body.shippingamount = shipping;
  if (txt(o.customer)) body.customername = txt(o.customer, 160);
  if (txt(o.phone)) body.customerphone = txt(o.phone, 40);
  if (txt(o.address)) body.customeraddress = txt(o.address, 300);
  if (txt(o.channel)) body.saleschannel = txt(o.channel, 80);
  if (txt(o.warehouse)) body.warehousecode = txt(o.warehouse, 30);
  if (txt(o.note)) body.description = txt(o.note, 500);
  if (o.cod === true) body.isCOD = true;

  if (o.paid !== undefined) {
    const paid = numOrNull(o.paid);
    if (paid === null || paid < 0) return { ok: false, error: "ยอดชำระ (paid) ต้องเป็นตัวเลขไม่ติดลบ" };
    if (paid > 0) {
      const method = txt(o.paymentMethod, 60);
      if (!method) return { ok: false, error: "ส่งยอดชำระมาแล้วต้องบอกวิธีชำระ (paymentMethod) — ZORT บังคับ" };
      if (paid > amount) return { ok: false, error: `ยอดชำระ ${paid} มากกว่ายอดสุทธิ ${amount}` };
      body.paymentamount = paid;
      body.paymentmethod = method;
      body.paymentdate = new Date(Date.now() + 7 * 3600e3).toISOString().replace("T", " ").slice(0, 16);
    }
  }

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body, linesTotal,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · เงินคิดที่ท่อ (ไม่ใช้ตัวเลขจากจอ) · ส่ง confirm:true เมื่อพร้อม" };

  const seen = await seenRef("sale", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "ใบขายนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const r = await zortPost("Order/AddOrder", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("sale", ref, { kind: "sale", number, amount, lines: list.length });
  return { ok: true, added: true, ref, number, amount, detail: r.detail, warn,
    message: `บันทึกรายการขาย ${number} ยอด ฿${amount} เข้า ZORT แล้ว` };
}
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** เพิ่มสินค้าเป็นชุดเข้า ZORT — จอ "เพิ่มสินค้าเป็นชุดใหม่" (soon: bundle-add) · งานกระดาน t_mu0m99go
 *  ⚠️ **ชื่อช่องมาจากเอกสารทางการ ZORT API V4** (developers.zortout.com/api-reference/bundle · อ่าน 14 ก.ย. 2569)
 *     POST Bundle/AddBundle · body: name · sku · sellprice (String) · sell_vat_status? (Int) ·
 *     list: [{ id | sku, quantity (Double) }] · สำเร็จ = resCode "200" + detail.id
 *  ⚠️ **ยังไม่เคยยิงจริง** (ทะเบียน ZORT_CAN_BUT_NOT_BUILT: 405 = เส้นมีอยู่เท่านั้น)
 *     ⇒ โหมดซ้อมเป็นค่าเริ่มต้น · ต้อง confirm:true + ref · ยิงใบแรกแล้วต้องดึงกลับมาดูว่าส่วนประกอบเข้าครบ
 *  ⚠️ ส่วนประกอบในชุด **ZORT ไม่เปิดให้อ่านกลับผ่าน API** (กระจกเราเก็บจากหน้าเว็บ ZORT ครั้งเดียว) */
export async function zortAddBundle(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const sku = txt(o.sku, 60);
  const name = txt(o.name, 200);
  if (!sku || !name) return { ok: false, error: "ต้องมีทั้ง sku และ name" };
  const price = numOrNull(o.price);
  if (price === null) return { ok: false, error: "ต้องมีราคาขาย (price) เป็นตัวเลข — ZORT บังคับ sellprice" };

  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return { ok: false, error: "ชุดต้องมีส่วนประกอบอย่างน้อย 1 รายการ" };
  const list = [];
  for (let i = 0; i < items.length; i++) {
    const s = txt(items[i]?.sku, 60);
    const q = numOrNull(items[i]?.qty);
    if (!s) return { ok: false, error: `ส่วนประกอบแถวที่ ${i + 1} ไม่มี sku` };
    if (q === null || q <= 0) return { ok: false, error: `ส่วนประกอบ ${s} จำนวนต้องเป็นตัวเลขมากกว่า 0` };
    if (s === sku) return { ok: false, error: `ชุด ${sku} ใส่ตัวเองเป็นส่วนประกอบไม่ได้` };
    list.push({ sku: s, quantity: q });
  }
  const body = { name, sku, sellprice: String(price), list };
  if (o.vat !== undefined) {
    const v = numOrNull(o.vat);
    if (v === null || !Number.isInteger(v)) return { ok: false, error: "vat ต้องเป็นจำนวนเต็ม (sell_vat_status)" };
    body.sell_vat_status = v;
  }

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ส่ง confirm:true เมื่อพร้อมบันทึกจริง" };

  const seen = await seenRef("bundle", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "ชุดนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const r = await zortPost("Bundle/AddBundle", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("bundle", ref, { kind: "bundle", sku, name, parts: list.length });
  return { ok: true, added: true, ref, sku, detail: r.detail, warn,
    message: `เพิ่มสินค้าชุด ${sku} (${list.length} ส่วนประกอบ) เข้า ZORT แล้ว` };
}

/** เพิ่มคลังสินค้า/สาขาเข้า ZORT — จอ "เพิ่มคลังสินค้า/สาขา" (soon: warehouse-add) · งานกระดาน t_mu0m99go
 *  ⚠️ **ชื่อช่องมาจากเอกสารทางการ ZORT API V4** (developers.zortout.com/api-reference/warehouse · อ่าน 14 ก.ย. 2569)
 *     POST Warehouse/AddWarehouse · code (บังคับ) · name (บังคับ) · address (ไม่บังคับ) · สำเร็จ = detail.id
 *  ⚠️ **API ไม่มีช่อง "เปิดบิลขายได้ไหม" (isPos)** — จอ ZORT ตั้งได้ แต่ท่อตั้งไม่ได้ ⇒ จอต้องเขียนบอก ห้ามทำช่องหลอก
 *  ⚠️ ยังไม่เคยยิงจริง · โหมดซ้อมเป็นค่าเริ่มต้น · คลังสร้างแล้วลบผ่าน API ไม่ได้ (ไม่มีเส้นลบในเอกสาร) */
export async function zortAddWarehouse(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const code = txt(o.code, 30);
  const name = txt(o.name, 120);
  if (!code || !name) return { ok: false, error: "ต้องมีทั้ง code และ name" };
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return { ok: false, error: "code ใช้ได้เฉพาะอักษรอังกฤษ ตัวเลข - _ (เหมือนคลังเดิม NEW · KLD · ANJ)" };
  const body = { code, name };
  if (txt(o.address)) body.address = txt(o.address, 300);

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ⚠️ คลังที่สร้างแล้วลบผ่าน API ไม่ได้" };

  const seen = await seenRef("warehouse", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "คลังนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const r = await zortPost("Warehouse/AddWarehouse", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("warehouse", ref, { kind: "warehouse", code, name });
  return { ok: true, added: true, ref, code, detail: r.detail, warn, message: `เพิ่มคลัง ${code} เข้า ZORT แล้ว` };
}

/** เพิ่มผู้ติดต่อ (ลูกค้า · คู่ค้า) เข้า ZORT — งานกระดาน t_mu0m97e5 ขั้น ② contact-add
 *  ⚠️ **ชื่อช่องมาจากเอกสารทางการ ZORT API V4** (อ่าน 14 ก.ย. 2569)
 *     POST Contact/AddContact · code (บังคับ) · name (บังคับ) · idnumber · phone · email · address ·
 *     branchname · branchno · facebook · line · instagram (ไม่บังคับ)
 *  ⚠️ **ไม่มีช่องกลุ่มลูกค้า/กลุ่มราคา** — ZORT ไม่เปิด API (ดู ZORT_NO_API) ห้ามทำช่องหลอกบนจอ
 *  ⚠️ ยังไม่เคยยิงจริง · โหมดซ้อมเป็นค่าเริ่มต้น · ไม่ส่ง `properties` (เอกสารไม่บอกรูปทรง ห้ามเดา) */
export async function zortAddContact(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const code = txt(o.code, 60);
  const name = txt(o.name, 160);
  if (!code || !name) return { ok: false, error: "ต้องมีทั้ง code และ name" };
  const body = { code, name };
  const idnumber = txt(o.taxId ?? o.idnumber, 30).replace(/[\s-]/g, "");
  /* เลขผู้เสียภาษีผิดหลักแล้วไปอยู่บนใบกำกับ = ใบใช้ไม่ได้ ⇒ ตีกลับตั้งแต่ท่อ ไม่ส่งครึ่ง ๆ */
  if (idnumber && !/^\d{13}$/.test(idnumber)) return { ok: false, error: "เลขผู้เสียภาษี (taxId) ต้องเป็นตัวเลข 13 หลัก" };
  if (idnumber) body.idnumber = idnumber;
  const email = txt(o.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "รูปแบบอีเมลไม่ถูกต้อง" };
  if (email) body.email = email;
  for (const [k, n] of [["phone", 40], ["address", 300], ["branchname", 80], ["branchno", 30],
    ["facebook", 120], ["line", 120], ["instagram", 120]]) {
    const v = txt(o[k], n);
    if (v) body[k] = v;
  }

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ⚠️ ผู้ติดต่อที่สร้างแล้วลบผ่าน API ไม่ได้ (แก้ได้ด้วย UpdateContact)" };

  const seen = await seenRef("contact", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "ผู้ติดต่อนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const r = await zortPost("Contact/AddContact", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("contact", ref, { kind: "contact", code, name });
  return { ok: true, added: true, ref, code, detail: r.detail, warn, message: `เพิ่มผู้ติดต่อ ${name} เข้า ZORT แล้ว` };
}

/* ── แก้/ลบสินค้า — งานกระดาน t_mu0m97e5 ขั้น ③ ──
   ⚠️ **ชื่อช่องมาจากเอกสารทางการ ZORT API V4** (developers.zortout.com/api-reference/product · อ่าน 14 ก.ย. 2569)
      POST Product/UpdateProduct?id=<Int> · body ไม่บังคับทุกช่อง: name · description · unittext · barcode ·
        sellprice (String) · purchaseprice (String) · sell_vat_status (0-3) · category · weight (กรัม) · height/length/width (ซม.)
      POST Product/DeleteProduct?id=<Int> · ไม่มี body
      GET  Product/GetProductDetail?id=<Int> · คืน id · sku · name · stock ...
   🔴 **ระบุด้วย id ของ ZORT ไม่ใช่ sku** ⇒ จอส่ง id ผิดตัวเดียว = ไปแก้/ลบสินค้าคนละตัวแบบเงียบสนิท
      ⇒ ต้องส่ง sku ที่คาดไว้มาคู่กันเสมอ แล้วตอนยืนยันท่อ **ถาม ZORT ก่อน** ว่า id นี้คือ sku นี้จริง
      ถามไม่สำเร็จ / รูปคำตอบไม่รู้จัก = ไม่ทำต่อ ("ไม่รู้" ≠ "ตรง")
   ⚠️ ยังไม่เคยยิงจริงทั้งสามเส้น · โหมดซ้อมไม่ยิงเน็ตเลย (ตรวจ id↔sku เฉพาะตอน confirm) */
const productId = (v) => {
  const s = String(v ?? "").trim();
  return /^\d{1,12}$/.test(s) && Number(s) > 0 ? Number(s) : null;
};

async function zortProductById(id) {
  const headers = creds();
  if (!headers) return { error: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  let r;
  try {
    r = await fetch(`${BASE}/Product/GetProductDetail?id=${id}`, { headers, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    return { error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message || e).slice(0, 120)}` };
  }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) return { error: `ถาม ZORT ไม่สำเร็จ (HTTP ${r.status})` };
  /* รูปคำตอบยังไม่เคยเห็นของจริง ⇒ รับเฉพาะก้อนที่ id ตรงกับที่ถามเท่านั้น ไม่งั้นถือว่าไม่รู้ */
  const p = [d, d?.detail, d?.product].find((x) => x && Number(x.id) === id);
  if (!p) return { error: `ZORT ไม่คืนสินค้า id ${id} (หรือรูปคำตอบไม่รู้จัก)` };
  return { product: p };
}

async function confirmProductIdentity(id, sku) {
  const got = await zortProductById(id);
  if (got.error) return { ok: false, unknown: true, error: `${got.error} — ยังไม่ได้แก้/ลบอะไร` };
  const real = String(got.product.sku ?? "").trim();
  if (real !== sku)
    return { ok: false, mismatch: true,
      error: `id ${id} ใน ZORT คือ ${real || "(ไม่มี sku)"} ${txt(got.product.name, 60)} — ไม่ใช่ ${sku} ⇒ ไม่ทำต่อ` };
  return { ok: true, product: got.product };
}

export async function zortUpdateProduct(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const id = productId(o.id);
  const sku = txt(o.sku, 60);
  if (!id || !sku) return { ok: false, error: "ต้องมีทั้ง id (ของ ZORT เป็นตัวเลข) และ sku ที่คาดไว้ — กันแก้ผิดตัว" };
  const body = {};
  for (const [key, field] of [["price", "sellprice"], ["cost", "purchaseprice"],
    ["weight", "weight"], ["height", "height"], ["length", "length"], ["width", "width"]]) {
    if (o[key] === undefined) continue;
    const n = numOrNull(o[key]);
    if (n === null || n < 0) return { ok: false, error: `ช่อง ${key} ต้องเป็นตัวเลขไม่ติดลบ — ยังไม่ส่งเข้า ZORT` };
    body[field] = String(n); // เอกสารกำหนดเป็น String ทุกช่องตัวเลขของเส้นนี้
  }
  if (o.vat !== undefined) {
    if (![0, 1, 2, 3].includes(Number(o.vat)) || String(o.vat).trim() === "")
      return { ok: false, error: "vat ต้องเป็น 0-3 (sell_vat_status)" };
    body.sell_vat_status = Number(o.vat);
  }
  /* ช่องข้อความว่าง = ไม่ส่ง (ยังไม่รู้ว่า ZORT ตีความ "" เป็นล้างค่าหรือเมิน ⇒ ห้ามเดา) */
  for (const [key, field, n] of [["name", "name", 200], ["description", "description", 500],
    ["unit", "unittext", 40], ["barcode", "barcode", 60], ["category", "category", 80]]) {
    const v = txt(o[key], n);
    if (v) body[field] = v;
  }
  if (!Object.keys(body).length) return { ok: false, error: "ไม่มีช่องให้แก้เลย" };

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: { query: { id }, body }, expectSku: sku,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ตอน confirm ท่อจะถาม ZORT ก่อนว่า id นี้คือ sku นี้จริง" };

  const seen = await seenRef("product-update", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "การแก้ครั้งนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };
  const who = await confirmProductIdentity(id, sku);
  if (!who.ok) return { ref, ...who };

  const r = await zortPost(`Product/UpdateProduct?id=${id}`, body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("product-update", ref, { kind: "product-update", id, sku, fields: Object.keys(body) });
  return { ok: true, updated: true, ref, id, sku, warn, message: `แก้สินค้า ${sku} ใน ZORT แล้ว` };
}

/** ลบสินค้าใน ZORT — ⚠️ **ลบแล้วเอาคืนไม่ได้**
 *  ด่านเพิ่มจากตัวแก้: **สต็อกใน ZORT ต้องเป็น 0 เป๊ะ** อ่านสต็อกไม่ได้ = ไม่ลบ
 *  (ลบของที่ยังมีสต็อก = ยอดคลังหายไปทั้งก้อนโดยไม่มีใบรองรับ) */
export async function zortDeleteProduct(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const id = productId(o.id);
  const sku = txt(o.sku, 60);
  if (!id || !sku) return { ok: false, error: "ต้องมีทั้ง id (ของ ZORT เป็นตัวเลข) และ sku ที่คาดไว้ — กันลบผิดตัว" };

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: { query: { id }, body: null }, expectSku: sku,
    note: "โหมดซ้อม — ⚠️ ลบแล้วเอาคืนไม่ได้ · ตอน confirm ท่อจะถาม ZORT ก่อนว่า id นี้คือ sku นี้ และสต็อกต้องเป็น 0" };

  const seen = await seenRef("product-delete", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ลบ" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "สินค้านี้เคยลบไปแล้ว — ไม่ได้ส่งซ้ำ" };
  const who = await confirmProductIdentity(id, sku);
  if (!who.ok) return { ref, ...who };
  const stock = numOrNull(who.product.stock);
  if (stock !== 0)
    return { ok: false, ref, error: `สินค้า ${sku} สต็อกใน ZORT = ${who.product.stock ?? "อ่านไม่ได้"} — ไม่ลบ (ต้องเป็น 0 ก่อน)` };

  const r = await zortPost(`Product/DeleteProduct?id=${id}`, {});
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("product-delete", ref, { kind: "product-delete", id, sku });
  return { ok: true, deleted: true, ref, id, sku, warn, message: `ลบสินค้า ${sku} ออกจาก ZORT แล้ว` };
}

/* ── รูปสินค้า · ต้นทุน · พิมพ์บาร์โค้ด — งานกระดาน t_mu0m98gq ──
   ต้นทุน (product-cost): ใช้ ?updateproduct=1 ช่อง cost → purchaseprice ได้เลย ไม่ต้องมีเส้นใหม่
     ⚠️ ZORT API มีแค่ purchaseprice (ราคาซื้อที่ตั้งไว้) **ไม่มีต้นทุนเฉลี่ย/ประวัติต้นทุน** — จอห้ามเขียนว่าเป็นต้นทุนเฉลี่ย
   พิมพ์บาร์โค้ด (product-print): **ไม่พบ API พิมพ์ฉลาก/บาร์โค้ด** — พิมพ์เป็นงานของจอ ท่อให้แค่ข้อมูลฉลาก
     (ไล่เอกสาร V4 แล้ว 14 ก.ย. 2569: Product · Document (มีแต่เอกสารของออเดอร์) · File Upload (ไฟล์แนบออเดอร์/ใบซื้อ/ใบเสนอราคา)
      ⇒ "ไม่พบในโมดูลที่อ่าน" ไม่ใช่ "ไม่มีแน่นอน")
   รูป (product-image): POST Product/UpdateProductImage?id=<Int> · multipart ช่อง `file` (เอกสาร V4 · 14 ก.ย. 2569)
     ⚠️ เอกสารไม่บอกว่า "แทนรูปเดิม" หรือ "ต่อท้าย" — ยังไม่เคยยิง ต้องดูของจริงใบแรก */

/** หาสินค้าใน ZORT ด้วย sku แบบตรงตัวเป๊ะ — ได้ id ของ ZORT ไปใช้กับแก้/ลบ/รูป (กระจก D1 ไม่มี id)
 *  ⚠️ เอกสารไม่บอกว่า searchsku ค้นตรงตัวหรือบางส่วน ⇒ กรองตรงตัวเองเสมอ (ขอ 00313 ห้ามได้ 00313-A)
 *  ⚠️ สามสถานะ: found · found:false (ไม่มีจริง) · unknown (ถามไม่สำเร็จ ≠ ไม่มี) */
export async function zortFindProduct(skuIn) {
  const sku = txt(skuIn, 60);
  if (!sku) return { ok: false, error: "ต้องระบุ sku" };
  const headers = creds();
  if (!headers) return { ok: false, error: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  let r;
  try {
    r = await fetch(`${BASE}/Product/GetProducts?searchsku=${encodeURIComponent(sku)}&limit=50`,
      { headers, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    return { ok: false, unknown: true, error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message || e).slice(0, 120)}` };
  }
  const d = r.ok ? await r.json().catch(() => null) : null;
  if (!d || !Array.isArray(d.list))
    return { ok: false, unknown: true, error: `ถาม ZORT ไม่สำเร็จ (HTTP ${r.status}) — ยังไม่รู้ว่ามีสินค้านี้ไหม` };
  const hit = d.list.filter((p) => String(p?.sku ?? "").trim() === sku);
  if (!hit.length) return { ok: true, found: false, sku };
  if (hit.length > 1) return { ok: false, error: `sku ${sku} ตรงกับสินค้า ${hit.length} ตัวใน ZORT — ไม่เดาว่าตัวไหน` };
  const p = hit[0];
  return { ok: true, found: true, product: {
    id: Number(p.id), sku, name: txt(p.name, 200), barcode: txt(p.barcode, 60) || null,
    sellprice: numOrNull(p.sellprice), purchaseprice: numOrNull(p.purchaseprice),
    stock: numOrNull(p.stock), availablestock: numOrNull(p.availablestock),
    unittext: txt(p.unittext, 40) || null, imagepath: txt(p.imagepath, 400) || null } };
}

/* ทีละ 10 ขนาน × 2 รอบ × เพดาน 8 วิ = ไม่เกิน ~16 วิ (เพดานฟังก์ชัน 26 วิ) ⇒ ขอได้ครั้งละ 20 รหัส */
export const LABEL_MAX = 20;
export async function zortProductLabels(skusIn) {
  const skus = [...new Set(String(skusIn ?? "").split(",").map((s) => txt(s, 60)).filter(Boolean))];
  if (!skus.length) return { ok: false, error: "ต้องระบุ skus (คั่นด้วย ,)" };
  if (skus.length > LABEL_MAX) return { ok: false, error: `ขอได้ครั้งละไม่เกิน ${LABEL_MAX} รหัส (ส่งมา ${skus.length})` };
  const rows = [];
  const missing = [];
  const failed = [];
  for (let i = 0; i < skus.length; i += 10) {
    const got = await Promise.all(skus.slice(i, i + 10).map((s) => zortFindProduct(s)));
    got.forEach((g, j) => {
      const s = skus[i + j];
      if (!g.ok) failed.push({ sku: s, error: g.error });
      else if (!g.found) missing.push(s);
      else rows.push({ sku: g.product.sku, name: g.product.name, barcode: g.product.barcode,
        sellprice: g.product.sellprice, unittext: g.product.unittext, noBarcode: !g.product.barcode });
    });
  }
  return { ok: rows.length > 0 || !failed.length, complete: !failed.length, rows, missing, failed,
    note: "ไม่พบ API พิมพ์บาร์โค้ดในเอกสาร ZORT — จอวาดฉลากเอง · noBarcode = ใน ZORT ไม่มีบาร์โค้ด (ห้ามเอา sku มาพิมพ์แทนเงียบ ๆ)" };
}

const IMG_MAX = 4 * 1024 * 1024; // base64 พองอีก 1/3 + เพดาน body ฟังก์ชัน ~6MB
/* ตรวจชนิดจากเนื้อไฟล์ ไม่เชื่อนามสกุลหรือ data URL ที่จอส่งมา */
function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function zortUpdateProductImage(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const id = productId(o.id);
  const sku = txt(o.sku, 60);
  if (!id || !sku) return { ok: false, error: "ต้องมีทั้ง id (ของ ZORT เป็นตัวเลข) และ sku ที่คาดไว้ — กันเปลี่ยนรูปผิดตัว" };
  const b64 = String(o.image ?? "").replace(/^data:[^;,]*;base64,/, "").replace(/\s+/g, "");
  if (!b64) return { ok: false, error: "ต้องส่ง image (base64 หรือ data URL)" };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, error: "image ไม่ใช่ base64" };
  const buf = Buffer.from(b64, "base64");
  if (buf.length > IMG_MAX) return { ok: false, error: `รูปใหญ่เกิน ${IMG_MAX / 1024 / 1024}MB — ย่อก่อนส่ง` };
  if (buf.length < 1024) return { ok: false, error: "ไฟล์เล็กผิดปกติ (<1KB) — ไม่น่าใช่รูปสินค้าจริง" };
  const type = sniffImage(buf);
  if (!type) return { ok: false, error: "ไฟล์ไม่ใช่รูป JPEG/PNG/WebP (ตรวจจากเนื้อไฟล์)" };
  const fileName = `${sku.replace(/[^A-Za-z0-9._-]/g, "_")}.${type === "image/jpeg" ? "jpg" : type.slice(6)}`;

  if (!o.confirm) return { ok: true, dryRun: true, ref, expectSku: sku,
    willSend: { query: { id }, file: { field: "file", name: fileName, type, bytes: buf.length } },
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ⚠️ ยังไม่รู้ว่า ZORT แทนรูปเดิมหรือต่อท้าย · ตอน confirm ท่อถาม ZORT ก่อนว่า id ตรง sku" };

  const seen = await seenRef("product-image", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "รูปนี้เคยส่งไปแล้ว — ไม่ได้ส่งซ้ำ" };
  const who = await confirmProductIdentity(id, sku);
  if (!who.ok) return { ref, ...who };

  const form = new FormData();
  form.append("file", new Blob([buf], { type }), fileName);
  const r = await zortPost(`Product/UpdateProductImage?id=${id}`, form);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("product-image", ref, { kind: "product-image", id, sku, bytes: buf.length });
  return { ok: true, updated: true, ref, id, sku, warn, message: `ส่งรูปสินค้า ${sku} เข้า ZORT แล้ว — ไปเปิดดูใน ZORT ว่าแทนหรือต่อท้าย` };
}

/* ── งานกระดาน t_mu0p3521: ท่อของ 4 ฟีเจอร์ที่ยังไม่มีเส้นเขียน (อันที่ 5 "ตั้งค่ากระจายสินค้า" = ไม่พบ API ดู ZORT_NO_API) ──
   ⚠️ ชื่อช่องทั้งหมดมาจากเอกสารทางการ ZORT API V4 (อ่าน 14 ก.ย. 2569) · ยังไม่เคยยิงจริงสักเส้น · โหมดซ้อมเป็นค่าเริ่มต้น
   🔴 **ใบสั่งขาย/ใบซื้อ ต้องระบุด้วย id ของ ZORT เท่านั้น ไม่รับเลขที่ใบ**
      เอกสารรับ number ได้ แต่เลขที่เอกสารของ ZORT **ซ้ำกันได้จริง** (กระจกเคยหาย 581 ใบเพราะเรื่องนี้)
      ⇒ ยิงด้วยเลขที่ใบ = อาจไปแก้ใบคนละใบแบบเงียบสนิท · จอหา id จากกระจก (?list=orders / ?list=purchases) แล้วส่ง id มา */

/** วนทำทีละแถวภายใต้เพดานเวลาฟังก์ชัน (26 วิ)
 *  ⚠️ เพดานเวลาเป็นของใช้ร่วมกัน: แถวใหม่เริ่มได้เฉพาะเมื่อ "เวลาที่ใช้ไป + เวลาเลวร้ายสุดของแถวหนึ่ง" ยังไม่เกินเส้น
 *     ไม่งั้นแถวสุดท้ายโดนตัดกลางคำขอ = ยิงไปแล้วแต่ไม่รู้ผล (สถานะ "ไม่รู้" ที่แพงที่สุด)
 *  ⚠️ หยุดกลางทาง ⇒ complete:false + nextRow ให้จอส่งแถวที่เหลือมาใหม่ · ref ของแต่ละแถวกันซ้ำให้แล้ว
 *  ⚠️ confirm ใช้ของทั้งชุดเท่านั้น (ไม่อ่าน confirm รายแถว) — กันชุดเดียวมีทั้งซ้อมทั้งจริงปนกัน */
export const BATCH_MAX = 20;
const BATCH_DEADLINE_MS = 22000;
export async function runBatch(rows, fn, { confirm = false, worstRowMs = 12000, now = Date.now } = {}) {
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: "ต้องส่ง rows อย่างน้อย 1 แถว" };
  if (rows.length > BATCH_MAX) return { ok: false, error: `ส่งได้ครั้งละไม่เกิน ${BATCH_MAX} แถว (ส่งมา ${rows.length}) — แบ่งส่งหลายรอบ` };
  const started = now();
  const results = [];
  for (let i = 0; i < rows.length; i++) {
    if (confirm && i > 0 && now() - started + worstRowMs > BATCH_DEADLINE_MS) break;
    const row = rows[i] && typeof rows[i] === "object" ? rows[i] : {};
    const r = await fn({ ...row, confirm: !!confirm });
    results.push({ row: i, ...r });
  }
  const notRun = rows.length - results.length;
  const count = (k) => results.filter((r) => r[k]).length;
  return {
    ok: notRun === 0 && results.every((r) => r.ok),
    complete: notRun === 0,
    dryRun: !confirm,
    total: rows.length,
    done: results.length,
    notRun,
    nextRow: notRun ? results.length : null,
    counts: { ok: count("ok"), failed: results.filter((r) => !r.ok).length, duplicate: count("duplicate"),
      unknown: count("unknown") },
    results,
  };
}

/** นำเข้าใบเสนอราคาหลายใบ (soon: quotation นำเข้า Excel)
 *  ZORT **ไม่มีเส้นรับหลายใบ** (เอกสาร: AddQuotation สร้างทีละใบ) ⇒ จออ่าน Excel แล้วส่งมาเป็น rows ท่อยิงทีละใบ
 *  แต่ละแถวใช้กติกาเดียวกับ ?addquotation=1 ครบทุกด่าน (ต้องมี ref · ลูกค้า · เงินสามชั้น) */
export async function zortAddQuotations(o = {}) {
  return runBatch(o.rows, zortAddQuotation, { confirm: o.confirm });
}

/** นำเข้าหลายแถวของเอกสารชนิดใดก็ได้ที่มีเส้นเพิ่มทีละใบ — งานกระดาน t_mu0qikag
 *  (soon: sale-import · buy-import · product-import · contact-import · ใบเสนอราคาใช้ร่วมด้วย)
 *  ZORT **ไม่มีเส้นรับหลายใบสักชนิด** (เอกสาร V4 ครบ 14 โมดูล) ⇒ ตัวกลางเดียว ยิงทีละแถวผ่านตัวเขียนเดิมของชนิดนั้น
 *  ⚠️ แต่ละแถวผ่านด่านของตัวเขียนเดิมครบทุกข้อ (ref · เงินสามชั้น · id/sku) — ตัวกลางไม่ตรวจซ้ำ ไม่ข้ามด่าน
 *  ⚠️ ชนิดที่ไม่รู้จัก = ตีกลับพร้อมรายการที่รับ ห้ามเดา */
const BATCH_WRITERS = {
  sale: zortAddSale,
  po: zortAddPurchaseOrder,
  product: zortAddProduct,
  contact: zortAddContact,
  quotation: zortAddQuotation,
};
export async function zortBatch(kindIn, o = {}) {
  const kind = String(kindIn ?? "").trim();
  const writer = Object.hasOwn(BATCH_WRITERS, kind) ? BATCH_WRITERS[kind] : null;
  if (!writer) return { ok: false, error: `ไม่รู้จักชนิด "${kind}"`, accepts: Object.keys(BATCH_WRITERS) };
  const r = await runBatch(o.rows, writer, { confirm: o.confirm });
  return { kind, ...r };
}

/** บันทึกข้อมูลจัดส่งให้ออเดอร์ (soon: shipping · บริการส่งสินค้า) → Order/EditOrderInfo?id=
 *  ส่งเฉพาะช่องจัดส่ง: trackingno · shippingchannel · shippingdate (yyyy-MM-dd)
 *  🔴 **ยังไม่รู้ว่า EditOrderInfo ล้างช่องที่ไม่ได้ส่งไหม** (เช่นชื่อ/ที่อยู่ลูกค้า) — เอกสารบอกแค่ว่าไม่บังคับ
 *     ⇒ ใบแรกที่ยิงจริงต้องดึง GetOrderDetail ก่อน/หลังมาเทียบทุกช่อง ก่อนเปิดให้นำเข้าเป็นชุด
 *  ⚠️ ไม่ทำ "จองขนส่ง" (ReadyToShip · BookOrderShipment) — เรียกขนส่งจริง/อาจเสียเงิน ต้องให้ท่านประธานอนุมัติก่อน */
export async function zortOrderShipping(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const id = productId(o.id);
  if (!id) return { ok: false, error: "ต้องมี id ของออเดอร์ใน ZORT (ตัวเลข) — ไม่รับเลขที่ใบเพราะซ้ำกันได้" };
  const body = {};
  const trackingno = txt(o.trackingNo ?? o.trackingno, 60);
  const shippingchannel = txt(o.shippingChannel ?? o.shippingchannel, 80);
  const shippingdate = txt(o.shippingDate ?? o.shippingdate, 10);
  if (shippingdate && !DAY_RE.test(shippingdate)) return { ok: false, error: "shippingDate ต้องเป็นรูป yyyy-MM-dd" };
  if (trackingno) body.trackingno = trackingno;
  if (shippingchannel) body.shippingchannel = shippingchannel;
  if (shippingdate) body.shippingdate = shippingdate;
  if (!Object.keys(body).length) return { ok: false, error: "ต้องมีอย่างน้อยหนึ่งช่อง: trackingNo · shippingChannel · shippingDate" };
  const path = `Order/EditOrderInfo?id=${id}`;

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: { path, body },
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ⚠️ ยังไม่รู้ว่า ZORT ล้างช่องที่ไม่ได้ส่งไหม ใบแรกต้องดึงกลับมาเทียบ" };

  const seen = await seenRef("order-shipping", ref);
  if (seen.state === "unknown")
    return { ok: false, ref, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "ข้อมูลจัดส่งแถวนี้เคยบันทึกแล้ว — ไม่ได้ส่งซ้ำ" };
  const r = await zortPost(path, body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("order-shipping", ref, { kind: "order-shipping", id, fields: Object.keys(body) });
  return { ok: true, updated: true, ref, id, warn, message: `บันทึกข้อมูลจัดส่งออเดอร์ id ${id} แล้ว` };
}

/** นำเข้าข้อมูลจัดส่งจาก Excel หลายแถว — กติกาเดียวกับ zortOrderShipping ทีละแถว */
export async function zortOrderShippingBatch(o = {}) {
  return runBatch(o.rows, zortOrderShipping, { confirm: o.confirm });
}

/** ตรวจนับ/รับของเข้าตามใบซื้อ (soon: stock-count) → PurchaseOrder/UpdatePartialPurchaseOrder หรือ UpdatePurchaseOrderStatus
 *  - ส่ง items [{sku, qty}] = รับบางส่วนตามจำนวนที่นับได้ → UpdatePartialPurchaseOrder?id=…&warehousecode&actiondate · body = [{sku, number}]
 *  - ไม่ส่ง items = รับครบทั้งใบ → UpdatePurchaseOrderStatus?id=…&status=1&warehousecode&actionDate
 *    (⚠️ เอกสารสะกดชื่อพารามิเตอร์วันที่ต่างกันสองเส้น: actiondate vs actionDate — ส่งตามเอกสารของแต่ละเส้น)
 *  🔴 **ยังไม่รู้ว่าจำนวนใน UpdatePartialPurchaseOrder คือ "ยอดรอบนี้" หรือ "ยอดสะสม"**
 *     เข้าใจผิดทางเดียว = ของเข้าซ้ำหรือขาดแบบเงียบ ⇒ ใบแรกต้องดูสต็อกก่อน/หลังด้วยตา
 *  🔴 สต็อกขยับจริงทุกครั้งที่ยิงสำเร็จ — ของที่รับเข้าแล้วถอยผ่าน API ไม่ได้ */
export async function zortReceivePurchaseOrder(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const id = productId(o.id);
  if (!id) return { ok: false, error: "ต้องมี id ของใบซื้อใน ZORT (ตัวเลข) — ไม่รับเลขที่ใบเพราะซ้ำกันได้" };
  const warehouse = txt(o.warehouse, 30);
  if (warehouse && !/^[A-Za-z0-9_-]+$/.test(warehouse)) return { ok: false, error: "warehouse ต้องเป็นรหัสคลัง (อักษรอังกฤษ/ตัวเลข)" };
  const date = txt(o.date, 10);
  if (date && !DAY_RE.test(date)) return { ok: false, error: "date ต้องเป็นรูป yyyy-MM-dd" };
  const items = o.items === undefined ? [] : o.items;
  if (!Array.isArray(items)) return { ok: false, error: "items ต้องเป็นรายการ [{sku, qty}]" };
  if (items.length > 200) return { ok: false, error: "รับของได้ครั้งละไม่เกิน 200 บรรทัด" };

  const q = new URLSearchParams({ id: String(id) });
  if (warehouse) q.set("warehousecode", warehouse);
  let path;
  let body;
  if (items.length) {
    body = [];
    for (let i = 0; i < items.length; i++) {
      const sku = txt(items[i]?.sku, 60);
      const qty = numOrNull(items[i]?.qty);
      if (!sku) return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มี sku` };
      if (qty === null || qty <= 0) return { ok: false, error: `บรรทัดที่ ${i + 1} จำนวนต้องมากกว่า 0` };
      body.push({ sku, number: qty });
    }
    if (date) q.set("actiondate", date);
    path = `PurchaseOrder/UpdatePartialPurchaseOrder?${q}`;
  } else {
    q.set("status", "1");
    if (date) q.set("actionDate", date);
    path = `PurchaseOrder/UpdatePurchaseOrderStatus?${q}`;
    body = {};
  }
  const mode = items.length ? "partial" : "all";

  if (!o.confirm) return { ok: true, dryRun: true, ref, mode, willSend: { path, body },
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · 🔴 ยิงจริงแล้วสต็อกขยับทันที ถอยไม่ได้ · ยังไม่รู้ว่าจำนวนเป็นยอดรอบนี้หรือยอดสะสม" };

  const seen = await seenRef("po-receive", ref);
  if (seen.state === "unknown")
    return { ok: false, ref, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "การรับของครั้งนี้เคยบันทึกแล้ว — ไม่ได้ส่งซ้ำ (กันของเข้าคลังซ้ำ)" };
  const r = await zortPost(path, body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("po-receive", ref, { kind: "po-receive", id, mode, lines: items.length });
  return { ok: true, received: true, ref, id, mode, warn,
    message: mode === "all" ? `รับของครบทั้งใบซื้อ id ${id} แล้ว` : `รับของ ${items.length} บรรทัดตามใบซื้อ id ${id} แล้ว` };
}

/** คืนสินค้าให้ผู้ขาย (soon: buy-return) → ReturnPurchaseOrder/AddReturnPurchaseOrder
 *  ⚠️ **คนละตัวกับ zortAddReturnOrder** — ReturnOrder = ลูกค้าคืนของให้เรา · ReturnPurchaseOrder = เราคืนของให้ผู้ขาย
 *  ⚠️ ชื่อช่องจากเอกสารทางการ ZORT API V4 (อ่าน 14 ก.ย. 2569): number* · amount* · list*[sku*, name*, number*, pricepernumber*, totalprice*]
 *     status "Pending"|"Success" · returnpurchaseorderdate (yyyy-MM-dd) · warehousecode · discount (String) · shippingamount ·
 *     referenceid (id ใบซื้อเดิม) · referencenumber · customername/customercode · paymentamount + paymentmethod
 *  🔴 **ZORT ไม่คิดเงินให้สักชั้น** ([[zort-sends-all-money-fields]]) ⇒ ท่อคิด totalprice ต่อบรรทัด + amount = รวม − ส่วนลด + ค่าส่ง
 *     เอกสารบังคับ pricepernumber ทุกบรรทัด ⇒ ไม่มีราคา = ตีกลับ ห้ามเดาเป็น 0
 *  🔴 เอกสาร**ไม่บอก**ว่า Success ตัดสต็อกออกทันทีไหม — ยังไม่เคยยิง ใบแรกต้องดูสต็อกก่อน/หลังด้วยตา · ค่าเริ่มต้นจึงเป็น Pending
 *  ⚠️ ไม่ทำเส้นยกเลิก/แก้ในรอบนี้ — ใบคืนที่สร้างผิดต้องไปแก้ใน ZORT */
export async function zortAddReturnPurchaseOrder(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const number = txt(o.number, 60) || ref;
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return { ok: false, error: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด" };
  const r2 = (n) => Math.round(n * 100) / 100;
  const list = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sku = txt(it?.sku, 60);
    const name = txt(it?.name, 200);
    const qty = numOrNull(it?.qty);
    const price = numOrNull(it?.price);
    if (!sku) return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มี sku` };
    if (!name) return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มีชื่อสินค้า (ZORT บังคับ name)` };
    if (qty === null || qty <= 0) return { ok: false, error: `บรรทัดที่ ${i + 1} จำนวนไม่ถูกต้อง` };
    if (price === null || price < 0)
      return { ok: false, error: `บรรทัดที่ ${i + 1} ไม่มีราคา — ZORT บังคับ pricepernumber และห้ามเดา` };
    list.push({ sku, name, number: qty, pricepernumber: price, totalprice: r2(qty * price) });
  }
  const discount = o.discount === undefined ? 0 : numOrNull(o.discount);
  const shipping = o.shipping === undefined ? 0 : numOrNull(o.shipping);
  if (discount === null || discount < 0) return { ok: false, error: "ส่วนลดต้องเป็นตัวเลขไม่ติดลบ" };
  if (shipping === null || shipping < 0) return { ok: false, error: "ค่าส่งต้องเป็นตัวเลขไม่ติดลบ" };
  const linesTotal = r2(list.reduce((s, l) => s + l.totalprice, 0));
  if (discount > linesTotal) return { ok: false, error: `ส่วนลด ${discount} มากกว่ายอดสินค้า ${linesTotal}` };
  const amount = r2(linesTotal - discount + shipping);

  const status = o.status === undefined ? "Pending" : txt(o.status, 20);
  if (!["Pending", "Success"].includes(status))
    return { ok: false, error: 'status ของใบคืนรับได้แค่ "Pending" หรือ "Success" (เอกสาร ZORT V4)' };
  const day = o.day === undefined ? null : txt(o.day, 10);
  if (day !== null && !DAY_RE.test(day)) return { ok: false, error: "day ต้องเป็นรูป yyyy-MM-dd" };
  const warehouse = txt(o.warehouse, 30);
  if (warehouse && !/^[A-Za-z0-9_-]+$/.test(warehouse)) return { ok: false, error: "warehouse ต้องเป็นรหัสคลัง (อักษรอังกฤษ/ตัวเลข)" };

  const body = {
    number, amount, list, status,
    returnpurchaseorderdate: day || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10),
  };
  if (discount > 0) body.discount = discount.toFixed(2);
  if (shipping > 0) body.shippingamount = shipping;
  if (warehouse) body.warehousecode = warehouse;
  if (txt(o.vendor)) body.customername = txt(o.vendor, 160);
  if (txt(o.vendorCode)) body.customercode = txt(o.vendorCode, 60);
  if (txt(o.note)) body.description = txt(o.note, 500);
  if (o.poId !== undefined) {
    const poId = productId(o.poId);
    if (!poId) return { ok: false, error: "poId ต้องเป็น id ของใบซื้อใน ZORT (ตัวเลข)" };
    body.referenceid = poId;
  }
  if (o.paid !== undefined) {
    const paid = numOrNull(o.paid);
    const method = txt(o.paymentMethod, 80);
    if (paid === null || paid <= 0) return { ok: false, error: "ยอดชำระ (paid) ต้องเป็นตัวเลขมากกว่า 0" };
    if (!method) return { ok: false, error: "ชำระเงินต้องระบุ paymentMethod" };
    if (paid > amount) return { ok: false, error: `ยอดชำระ ${paid} มากกว่ายอดใบ ${amount}` };
    body.paymentamount = paid;
    body.paymentmethod = method;
  }

  if (!o.confirm) return { ok: true, dryRun: true, ref, linesTotal, willSend: body,
    note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · 🔴 เอกสารไม่บอกว่า Success ตัดสต็อกทันทีไหม ใบแรกต้องดูสต็อกก่อน/หลัง" };

  const seen = await seenRef("po-return", ref);
  if (seen.state === "unknown")
    return { ok: false, ref, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "ใบคืนนี้เคยบันทึกแล้ว — ไม่ได้ส่งซ้ำ" };
  const r = await zortPost("ReturnPurchaseOrder/AddReturnPurchaseOrder", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("po-return", ref, { kind: "po-return", number, lines: list.length, amount });
  return { ok: true, added: true, ref, number, amount, detail: r.detail, warn,
    message: `บันทึกคืนสินค้าให้ผู้ขาย ${number} ยอด ฿${amount} เข้า ZORT แล้ว` };
}

/** หาใบสั่งซื้อใน ZORT ด้วยเลขที่ใบ — ได้ id ของ ZORT ไปใช้กับ ?poreceive (soon: stock-count · งานกระดาน t_mu0tx40g)
 *  ⚠️ กระจก D1 (purchase_orders) ใช้เลขที่ใบเป็นกุญแจ **ไม่มี id ของ ZORT** ⇒ ต้องถาม ZORT
 *  ⚠️ เอกสาร V4: GetPurchaseOrders รับ `numberlist` เป็น **header** (ไม่ใช่ query) · คืน id · number · status · warehousecode · list
 *  🔴 **เลขที่เอกสารของ ZORT ซ้ำกันได้จริง** (กระจกเคยหาย 581 ใบเพราะเรื่องนี้)
 *     ⇒ กรองเลขตรงตัวเอง · เจอมากกว่าหนึ่งใบ = ตีกลับพร้อมรายชื่อ id ห้ามเดาว่าใบไหน
 *  ⚠️ สามสถานะ: found · found:false (ไม่มีจริง) · unknown (ถามไม่สำเร็จ ≠ ไม่มี)
 *  ⚠️ ยังไม่เคยยิงจริงว่า ZORT กรองด้วย header นี้จริงไหม — ถ้าไม่กรอง จะได้หลายใบกลับมา แล้วตัวกรองตรงตัวของเรายังกันผิดใบได้ */
export async function zortFindPurchaseOrder(numberIn) {
  const number = txt(numberIn, 60);
  if (!number) return { ok: false, error: "ต้องระบุเลขที่ใบสั่งซื้อ" };
  const headers = creds();
  if (!headers) return { ok: false, error: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  let r;
  try {
    r = await fetch(`${BASE}/PurchaseOrder/GetPurchaseOrders?limit=50`, {
      headers: { ...headers, numberlist: number },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { ok: false, unknown: true, error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message || e).slice(0, 120)}` };
  }
  const d = r.ok ? await r.json().catch(() => null) : null;
  if (!d || !Array.isArray(d.list))
    return { ok: false, unknown: true, error: `ถาม ZORT ไม่สำเร็จ (HTTP ${r.status}) — ยังไม่รู้ว่ามีใบนี้ไหม` };
  const hit = d.list.filter((p) => String(p?.number ?? "").trim() === number);
  if (!hit.length) return { ok: true, found: false, number, returned: d.list.length };
  if (hit.length > 1)
    return { ok: false, duplicate: true, error: `เลขที่ใบ ${number} ซ้ำกัน ${hit.length} ใบใน ZORT — ไม่เดาว่าใบไหน`,
      ids: hit.map((p) => Number(p.id)) };
  const p = hit[0];
  return { ok: true, found: true, purchaseOrder: {
    id: Number(p.id), number, status: txt(p.status, 30) || null, warehousecode: txt(p.warehousecode, 30) || null,
    amount: numOrNull(p.amount), paymentstatus: txt(p.paymentstatus, 30) || null,
    lines: Array.isArray(p.list) ? p.list.map((l) => ({ sku: txt(l?.sku, 60), name: txt(l?.name, 200), qty: numOrNull(l?.number) })) : null,
  } };
}

/** อ่านใบสั่งซื้อด้วย id ของ ZORT — ใช้ยืนยันตัวใบก่อน/หลังยกเลิก · งานกระดาน t_mu1bh3s7
 *  ⚠️ เอกสาร V4: GET PurchaseOrder/GetPurchaseOrderDetail?id= · status: Pending · Waiting · Shipping · Success · Partial Transfer · Voided
 *  🔴 สามสถานะ: ถามไม่สำเร็จ = unknown (ห้ามแปลว่าไม่มีใบ) · ไม่พบ = found:false · พบ = purchaseOrder */
export async function zortGetPurchaseOrderById(idIn) {
  const id = productId(idIn);
  if (!id) return { ok: false, error: "ต้องระบุ id ของใบสั่งซื้อใน ZORT (ตัวเลข)" };
  const headers = creds();
  if (!headers) return { ok: false, error: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  let r;
  try {
    r = await fetch(`${BASE}/PurchaseOrder/GetPurchaseOrderDetail?id=${id}`, { headers, signal: AbortSignal.timeout(8000) });
  } catch (e) {
    return { ok: false, unknown: true, error: `ถาม ZORT ไม่สำเร็จ: ${String(e?.message || e).slice(0, 120)}` };
  }
  const d = r.ok ? await r.json().catch(() => null) : null;
  if (!d) return { ok: false, unknown: true, error: `ถาม ZORT ไม่สำเร็จ (HTTP ${r.status}) — ยังไม่รู้สถานะใบนี้` };
  /* รูปคำตอบยังไม่เคยเห็นของจริง ⇒ รับเฉพาะก้อนที่ id ตรงกับที่ถาม (ท่าเดียวกับ zortProductById) */
  const p = [d, d?.detail, d?.purchaseorder].find((x) => x && Number(x.id) === id);
  if (!p) {
    const code = String(d?.res?.resCode ?? d?.resCode ?? "");
    if (code && code !== "200") return { ok: true, found: false, id, zortCode: code };
    return { ok: false, unknown: true, error: `ZORT ไม่คืนใบสั่งซื้อ id ${id} (หรือรูปคำตอบไม่รู้จัก) — ยังไม่รู้สถานะ` };
  }
  return { ok: true, found: true, purchaseOrder: {
    id, number: txt(p.number, 60) || null, status: txt(p.status, 30) || null,
    amount: numOrNull(p.amount), paymentstatus: txt(p.paymentstatus, 30) || null,
  } };
}

/** ยกเลิกใบสั่งซื้อใน ZORT (PurchaseOrder/VoidPurchaseOrder?id=) · งานกระดาน t_mu1bh3s7
 *  ใช้ยกเลิก **ใบทดสอบ** ตอนเปิดปุ่มส่งจริงของจอสร้างรายการซื้อ ("ทดสอบด้วยใบจริงมูลค่าน้อย แล้วยกเลิกทันที")
 *  ⚠️ เอกสาร V4: POST ?id= หรือ ?number= · ไม่มี body · ตอบ resCode · **ยังไม่เคยยิงจริง**
 *  🔴 VoidQuotation ของ ZORT ยิงจริงแล้วตอบ 'Invalid ID.' (6 ก.ย. 2569) ⇒ **ห้ามเชื่อ resCode 200 อย่างเดียว**
 *     ⇒ ยิงแล้วอ่านใบกลับมาดูว่า status เป็น Voided จริง (verified) · อ่านไม่ได้ = บอกว่ายังไม่รู้ ไม่ใช่สำเร็จ
 *  🔴 ใช้ id เท่านั้น + ต้องส่งเลขที่ใบที่คาดไว้มายืนยัน (เลขที่ใบซ้ำกันได้ ⇒ ห้ามยกเลิกผิดใบ)
 *  🔴 ใบที่ Success/Partial Transfer (รับของเข้าคลังแล้ว) **ไม่ยกเลิก** — สต็อกขยับไปแล้ว ต้องจัดการใน ZORT เอง */
export async function zortVoidPurchaseOrder(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const id = productId(o.id);
  if (!id) return { ok: false, error: "ต้องมี id ของใบสั่งซื้อใน ZORT (ตัวเลข) — ไม่รับเลขที่ใบอย่างเดียว" };
  const expect = txt(o.number, 60);
  if (!expect) return { ok: false, error: "ต้องส่งเลขที่ใบที่คาดไว้ (number) มาด้วย — กันยกเลิกผิดใบ" };
  const path = `PurchaseOrder/VoidPurchaseOrder?id=${id}`;

  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: { path, body: {} }, expectNumber: expect,
    note: "โหมดซ้อม — ยังไม่ได้ยกเลิก · ตอน confirm ท่อจะอ่านใบก่อน (เลขที่ใบต้องตรง · ต้องยังไม่รับของ) แล้วอ่านกลับหลังยกเลิก" };

  const seen = await seenRef("po-void", ref);
  if (seen.state === "unknown") return { ok: false, ref, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ยกเลิก" };
  if (seen.state === "seen") return { ok: true, duplicate: true, ref, first: seen.info, message: "สั่งยกเลิกใบนี้ไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const before = await zortGetPurchaseOrderById(id);
  if (!before.ok) return { ok: false, ref, unknown: !!before.unknown, error: `${before.error} — ยังไม่ได้ยกเลิก` };
  if (!before.found) return { ok: false, ref, error: `ไม่พบใบสั่งซื้อ id ${id} ใน ZORT — ไม่ได้ยกเลิก` };
  const po = before.purchaseOrder;
  if (po.number !== expect)
    return { ok: false, ref, mismatch: true, error: `id ${id} ใน ZORT คือ ${po.number || "(ไม่มีเลขที่ใบ)"} — ไม่ใช่ ${expect} ⇒ ไม่ยกเลิก` };
  if (po.status === "Voided") return { ok: true, ref, id, number: po.number, alreadyVoided: true, message: `ใบ ${po.number} ถูกยกเลิกอยู่แล้ว` };
  if (["Success", "Partial Transfer"].includes(po.status))
    return { ok: false, ref, error: `ใบ ${po.number} สถานะ ${po.status} (รับของเข้าคลังแล้ว) — ไม่ยกเลิกจากท่อ ต้องจัดการใน ZORT` };

  const r = await zortPost(path, {});
  if (!r.ok) return { ok: false, ref, id, unknown: !!r.unknown, error: r.error };

  const after = await zortGetPurchaseOrderById(id);
  const verified = after.ok && after.found && after.purchaseOrder.status === "Voided";
  if (!verified) {
    return { ok: false, ref, id, number: po.number, unknown: !after.ok, voidAccepted: true,
      statusAfter: after.ok && after.found ? after.purchaseOrder.status : null,
      error: after.ok
        ? `ZORT ตอบรับคำสั่งยกเลิก แต่อ่านกลับแล้วสถานะยังเป็น ${after.found ? after.purchaseOrder.status : "ไม่พบใบ"} — **ยังไม่ได้ยกเลิกจริง** ไปยกเลิกในหน้าจอ ZORT`
        : `ZORT ตอบรับคำสั่งยกเลิก แต่อ่านกลับไม่ได้ — ยังไม่รู้ว่ายกเลิกจริงไหม ไปตรวจใน ZORT` };
  }
  const warn = await markSafely("po-void", ref, { kind: "po-void", id, number: po.number });
  return { ok: true, voided: true, verified: true, ref, id, number: po.number, warn, message: `ยกเลิกใบสั่งซื้อ ${po.number} ใน ZORT แล้ว (อ่านกลับยืนยันสถานะ Voided)` };
}

/** สร้างใบสั่งซื้อใน ZORT — จอ "สร้างรายการซื้อ" เรียกตัวนี้
 *  ⚠️ ไม่ส่ง `confirm: true` = โหมดซ้อม (ZORT ไม่เปิด Update/Delete ให้ใบซื้อ ⇒ ผิดแล้วแก้ไม่ได้)
 */
/* 💰 **กติกาเงินของ ZORT — ใช้ร่วมกันทุกใบ (ใบเสนอราคา · ใบสั่งซื้อ · ใบรับคืน)**
 *
 * 🔴 **ZORT ไม่คำนวณอะไรให้เลยสักชั้น** เก็บเฉพาะตัวเลขที่เราส่งไปตรง ๆ
 *    พิสูจน์ด้วยของจริง 6 ก.ย. 2569 ทีละชั้น (ใบทดสอบ QT-202609001 · QT-202609002):
 *      ส่งแต่ `pricepernumber` → บรรทัดมีราคาต่อหน่วย แต่ **ยอดรวมบรรทัดเป็น 0**
 *      เติม `totalprice`      → บรรทัดถูกแล้ว แต่ **ยอดหัวใบยังเป็น 0**
 *      ⇒ ต้องส่งครบ **สามชั้น**: ราคาต่อหน่วย → ยอดรวมบรรทัด → ยอดรวมหัวใบ
 *
 * ⚠️ **นี่คือกับดัก "ยิงผ่าน แต่ข้อมูลไม่เข้าช่อง"** — ZORT ตอบสำเร็จ สร้างเอกสารจริง
 *    ให้เลขที่ใบจริง **แต่ราคาเป็นศูนย์** ไม่มีอะไรฟ้องสักคำ
 * ⚠️ ตอนเจอครั้งแรกแก้แค่ชั้นเดียวแล้วนึกว่าจบ — **วัดทีละชั้นเท่านั้นถึงจะเห็นชั้นที่เหลือ**
 * ⚠️ **ห้ามคิดบรรทัดที่ไม่มีราคาเป็นศูนย์** — "ยังไม่รู้ราคา" ≠ "ราคาศูนย์"
 *    นับเป็นศูนย์ = ได้ยอดต่ำกว่าจริงแบบดูสมเหตุสมผล ซึ่งจับด้วยตาไม่ได้
 *    ⇒ มีบรรทัดไหนไม่มีราคา = **ไม่ส่งยอดหัวใบเลย** ปล่อยให้เห็นว่าใบนั้นยังไม่ครบ
 * ⚠️ ไม่ส่ง `amount_pretax`/`vatamount` — ขึ้นกับ vattype ปล่อย ZORT คิด แล้วค่อยวัด
 *    ⚠️ **ใบที่มีภาษียังไม่ผ่านการตรวจ** ใบทดสอบทั้งสองใบเป็นแบบไม่มีภาษี (vattype 1)
 */
function headerAmount(list) {
  if (!list.length) return {};
  if (!list.every((l) => typeof l.totalprice === "number")) return {};
  return { amount: Math.round(list.reduce((s, l) => s + l.totalprice, 0) * 10000) / 10000 };
}

/**
 * สร้างใบ "รับคืนสินค้า" (ReturnOrder/AddReturnOrder) — ฝั่งจอขอมา 6 ก.ย. 2569
 *
 * ⚠️⚠️ **ใบนี้คือการรับคืนจาก "ลูกค้า" ไม่ใช่การคืนของให้ "ผู้ขาย"**
 *    ฝั่งจอขอมาในชื่อ "คืนสินค้าซื้อ" พร้อมช่อง `vendor` — **แต่ตรวจของจริงแล้วไม่ใช่**
 *    ใบในระบบ 682 ใบเป็น **CN-…** (ใบลดหนี้) และทุกใบมีช่อง **ลูกค้า** ไม่มีช่องผู้ขายเลย
 *    ⇒ รับพารามิเตอร์เป็น `customer` · ยังรับ `vendor` เป็นชื่อพ้องไว้ให้จอเดิมไม่พัง
 *      แต่ **ป้ายบนจอต้องเขียนว่า "รับคืนจากลูกค้า"** ไม่งั้นร้านจะออกใบลดหนี้ให้ลูกค้า
 *      โดยเข้าใจว่ากำลังคืนของให้โรงงาน — **ผิดทั้งสต็อกและบัญชี**
 *    ⇒ กวาดหาใบคืนฝั่งผู้ขายแล้ว (`PurchaseReturn/*` · `ReturnPurchase/*`) → **404 ทุกชื่อ**
 *
 * ⚠️ โหมดซ้อมเป็นค่าเริ่มต้น — ต้องส่ง `confirm: true` ถึงจะเขียนจริง
 * ⚠️ ต้องมี `ref` เสมอ (กันยิงซ้ำที่ระดับที่เก็บข้อมูล เหมือนใบซื้อ/ใบเสนอราคา)
 * ⚠️ **ยังไม่เคยยิงจริงสักใบ** — ต้องยิงหนึ่งใบแล้วดึงกลับมาดูว่าเงินเข้าถูกช่องก่อนเปิดปุ่ม
 */
export async function zortAddReturnOrder(o = {}) {
  const ref = cleanRef(o.ref);
  if (!ref) return { ok: false, error: "ต้องส่ง ref มาด้วยเสมอ (กันยิงซ้ำ)" };
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return { ok: false, error: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด" };

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
      number: qty, // ⚠️ ZORT เรียกจำนวนว่า `number` · `amount` แปลว่ามูลค่าเงิน
      ...(price === null ? {} : { pricepernumber: price, totalprice: qty * price }),
    });
  }

  const body = { list, ...headerAmount(list) };
  const who = txt(o.customer, 160) || txt(o.vendor, 160);
  if (who) body.customername = who;
  if (txt(o.note)) body.description = txt(o.note, 500);
  if (txt(o.reference)) body.reference = txt(o.reference, 80);

  if (!o.confirm)
    return { ok: true, dryRun: true, ref, willSend: body,
      note: "โหมดซ้อม — ยังไม่ได้ส่งเข้า ZORT · ส่ง confirm:true เมื่อพร้อมบันทึกจริง",
      warnKind: "ใบนี้คือ **รับคืนจากลูกค้า** (ใบลดหนี้ CN-) ไม่ใช่การคืนของให้ผู้ขาย" };

  const seen = await seenRef("returnorder", ref);
  if (seen.state === "unknown")
    return { ok: false, error: "ตอนนี้ตรวจใบซ้ำไม่ได้ (ที่เก็บมีปัญหา) — ยังไม่ส่งเข้า ZORT ลองใหม่อีกครั้ง" };
  if (seen.state === "seen")
    return { ok: true, duplicate: true, ref, first: seen.info, message: "ใบนี้เคยบันทึกไปแล้ว — ไม่ได้ส่งซ้ำ" };

  const r = await zortPost("ReturnOrder/AddReturnOrder", body);
  if (!r.ok) return { ok: false, ref, unknown: !!r.unknown, error: r.error };
  const warn = await markSafely("returnorder", ref, { kind: "returnorder", who, lines: list.length });
  return { ok: true, added: true, ref, lines: list.length, detail: r.detail, warn,
    message: `สร้างใบรับคืนสินค้า (${list.length} บรรทัด) แล้ว — **ต้องดึงใบกลับมาดูว่าเงินเข้าถูกช่อง**` };
}

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
      // 🔴 ต้องมี totalprice เสมอ — ZORT ไม่บวกให้ (ดูเหตุผลเต็มที่ `moneyRules` ท้ายไฟล์)
      ...(price === null ? {} : { pricepernumber: price, totalprice: qty * price }),
    });
  }

  const body = { list, ...headerAmount(list) };
  if (txt(o.vendor)) body.customername = txt(o.vendor, 160);
  /* ── "สร้างรายการซื้อแบบเร็ว" (soon: buy-create-quick · งานกระดาน t_mu0p3521) ──
     ZORT **ไม่มีเส้นแยก** (เอกสาร V4 หน้า Purchase Order มีแค่ AddPurchaseOrder) ⇒ "แบบเร็ว" = ใบเดิม + สถานะ + จ่ายเงินในคำขอเดียว
     ⚠️ เอกสารให้ status แค่ "Pending" (ค่าเริ่มต้น) กับ "Success" · paymentamount ต้องมาคู่ paymentmethod
     🔴 **"Success" น่าจะรับของเข้าคลังทันที** (สต็อกขยับ) — ยังไม่เคยยิง ⇒ ใบแรกต้องดูสต็อกก่อน/หลัง
     ⚠️ ไม่ส่งช่องคลัง เพราะเอกสารหน้านี้ที่อ่านไม่ยืนยันชื่อช่อง ⇒ ZORT ใช้คลังค่าเริ่มต้นของร้าน */
  if (o.status !== undefined) {
    const status = txt(o.status, 20);
    if (!["Pending", "Success"].includes(status))
      return { ok: false, error: 'status ของใบซื้อรับได้แค่ "Pending" หรือ "Success" (เอกสาร ZORT V4)' };
    body.status = status;
  }
  if (o.paid !== undefined) {
    const paid = numOrNull(o.paid);
    const method = txt(o.paymentMethod, 80);
    if (paid === null || paid <= 0) return { ok: false, error: "ยอดชำระ (paid) ต้องเป็นตัวเลขมากกว่า 0" };
    if (!method) return { ok: false, error: "ชำระเงินต้องระบุ paymentMethod (ชื่อวิธีชำระที่มีใน ZORT)" };
    /* ยอดหัวใบไม่รู้ (มีบรรทัดไม่มีราคา) = ตรวจไม่ได้ว่าจ่ายเกินไหม ⇒ ไม่ยอมให้จ่าย ห้ามเดา */
    if (typeof body.amount !== "number")
      return { ok: false, error: "ใส่ราคาให้ครบทุกบรรทัดก่อน จึงบันทึกจ่ายเงินพร้อมกันได้" };
    if (paid > body.amount) return { ok: false, error: `ยอดชำระ ${paid} มากกว่ายอดใบ ${body.amount}` };
    body.paymentamount = paid;
    body.paymentmethod = method;
  }
  if (txt(o.note)) body.description = txt(o.note, 500);

  /* linesTotal ให้จอเทียบยอดที่ท่อคิดกับยอดที่จอคิด (gucut2 ขอ 14 ก.ย. 2569 · งานกระดาน t_mu11n7mh)
     ⚠️ null = มีบรรทัดไม่มีราคา ท่อไม่คิดยอดหัวใบ ⇒ ห้ามให้เป็น 0 (จอจะขึ้นเตือนผิดทาง) */
  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body, linesTotal: body.amount ?? null,
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
 *  ⚠️ **เรื่องการแก้ทีหลัง — ยิงตรวจ 6 ก.ย. 2569 ได้ผลสามอย่าง อย่าสรุปจากเส้นเดียว**
 *     `Quotation/UpdateQuotation`       → 404  (ไม่มีเส้นนี้)
 *     `Quotation/UpdateQuotationStatus` → 404  (ไม่มีเส้นนี้)
 *     `Quotation/EditQuotation`         → resCode 100 = **เส้นนี้มีจริง**
 *     ⇒ ใบเสนอราคา "น่าจะแก้ได้" ผ่านชื่อ EditQuotation — ต่างจากใบสั่งซื้อที่ไม่มีเส้นแก้เลย
 *  ⚠️ แต่ `resCode 100` บอกได้แค่ **"เส้นมีอยู่"** ไม่ได้บอกว่ารับพารามิเตอร์อะไร
 *     หรือแก้ได้ทุกช่องไหม ⇒ **ห้ามเขียนบนจอว่า "แก้ไขได้"** จนกว่าจะยิงของจริงสำเร็จหนึ่งใบ
 *     ⇒ ระหว่างนี้ถือความเสี่ยงเท่าใบสั่งซื้อ · โหมดซ้อมเป็นค่าเริ่มต้นเหมือนกัน
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
      /* 🔴 **ต้องส่ง `totalprice` ไปด้วยเสมอ — ZORT ไม่คิดยอดรวมของบรรทัดให้เอง**
          (พิสูจน์กับของจริง 6 ก.ย. 2569 ไม่ได้เดา)
          ใบทดสอบใบแรก QT-202609001 ส่งแต่ `pricepernumber: 10` แล้วดึงกลับมาดู:
            pricepernumber = 10 ✅ (ราคาต่อหน่วยเข้าถูกช่อง)
            totalprice = 0 ❌  ⇒ **ยอดหัวใบ = ผลรวมของศูนย์ = ฿0**
          เทียบกับใบที่ใช้งานจริง QT-202506001 (฿70,000): totalprice = 14,073.3945
          และ 14,073.3945 ÷ จำนวน 12 = 1,172.7829 = pricepernumber พอดี
          ⇒ กติกาคือ totalprice = จำนวน × ราคาต่อหน่วย

          ⚠️ **นี่คือกับดัก "ยิงผ่าน แต่ข้อมูลไม่เข้าช่อง"** — ZORT ตอบสำเร็จทุกอย่าง
             สร้างเอกสารจริง ได้เลขที่ใบจริง **แต่ราคาเป็นศูนย์**
             ถ้าเปิดให้ใช้โดยไม่ดึงใบกลับมาดู ใบเสนอราคาทุกใบจะเป็น ฿0 แบบเงียบ ๆ
          ⚠️ ไม่ส่ง `totalprice_pretax` / `totalprice_vat` โดยตั้งใจ — สองตัวนั้นขึ้นกับ
             สถานะภาษีของสินค้า ซึ่ง ZORT คิดเองอยู่แล้ว (ใบทดสอบได้ pretax = 10 ถูกต้อง)
             ส่งไปเองเสี่ยงทับค่าที่ถูกด้วยค่าที่เราคำนวณผิด */
      ...(price === null ? {} : { pricepernumber: price, totalprice: qty * price }),
    });
  }

  /* 🔴 **ยอดหัวใบ `amount` ก็ต้องส่งเอง — ZORT ไม่บวกจากบรรทัดให้**
      (พิสูจน์กับของจริง 6 ก.ย. 2569 ใบทดสอบใบที่สอง QT-202609002)
      ส่ง totalprice ไปแล้ว **บรรทัดได้ยอดถูก (20) แต่หัวใบยังเป็น 0**
      ⇒ ZORT เก็บเฉพาะที่เราส่ง **ทั้งสองชั้น** ไม่ derive อะไรให้เลยสักชั้น
      ⇒ ต้องส่งครบสามชั้น: ราคาต่อหน่วย → ยอดรวมบรรทัด → ยอดรวมหัวใบ

   ⚠️ บวกจาก **บรรทัดที่มีราคาเท่านั้น** — บรรทัดที่ไม่ส่งราคามาถือว่ายังไม่รู้ราคา
      ถ้านับเป็นศูนย์ จะได้ยอดที่ต่ำกว่าจริงแบบดูสมเหตุสมผล ซึ่งจับด้วยตาไม่ได้
   ⚠️ ยังไม่ส่ง `amount_pretax` / `vatamount` — สองตัวนั้นขึ้นกับ vattype ของใบ
      ปล่อยให้ ZORT คิดเองก่อน แล้ววัดผลจริงว่ามันคิดให้ไหม (ทำทีละชั้น วัดทีละชั้น)
      ⚠️ **ใบที่มีภาษีจึงยังไม่ถือว่าผ่านการตรวจ** — ใบทดสอบเป็นแบบไม่มีภาษี (vattype 1) */
  const body = { customername: customer, list, ...headerAmount(list) };
  if (txt(o.phone)) body.customerphone = txt(o.phone, 40);
  if (txt(o.note)) body.description = txt(o.note, 500);
  if (txt(o.reference)) body.reference = txt(o.reference, 80);

  /* linesTotal: ดูเหตุผลที่ zortAddPurchaseOrder (t_mu11n7mh) · null = มีบรรทัดไม่มีราคา ห้ามให้เป็น 0 */
  if (!o.confirm) return { ok: true, dryRun: true, ref, willSend: body, linesTotal: body.amount ?? null,
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

/**
 * แก้ใบเสนอราคาที่มีอยู่แล้ว (Quotation/EditQuotation)
 *
 * 🛑 **เครื่องมือสำหรับตรวจสอบ ไม่ใช่ของใช้ประจำวัน — อ่านก่อนเรียก**
 *   สร้างขึ้น 6 ก.ย. 2569 เพื่อพิสูจน์ว่าการส่ง `totalprice` แก้ปัญหาใบราคา ฿0 ได้จริง
 *   โดย**ไม่ต้องสร้างเอกสารทดสอบใบใหม่ในระบบบัญชีของร้าน** (เจ้าของร้านเลือกทางนี้เอง)
 *
 * ⚠️ **ส่ง `list` ไป = ทับรายการสินค้าทั้งใบ ไม่ใช่แก้เฉพาะบรรทัดที่ส่ง**
 *    ⇒ ใบที่มี 5 บรรทัด ถ้าส่งไปบรรทัดเดียว **อีก 4 บรรทัดหายทั้งใบ**
 *    ยังไม่ได้ทดสอบพฤติกรรมนี้กับใบหลายบรรทัด — **ห้ามใช้กับใบของลูกค้าจริง**
 *    จนกว่าจะยิงทดสอบกับใบหลายบรรทัดแล้วดึงกลับมานับบรรทัดยืนยัน
 * ⚠️ ต้องส่ง `confirm: true` ถึงจะเขียนจริง · ไม่ส่ง = คืนสิ่งที่จะส่งให้ดูเฉย ๆ
 * ⚠️ ไม่มีตัวกันยิงซ้ำแบบ `ref` เพราะการแก้ใบเดิมซ้ำด้วยค่าเดิม **ไม่ทำให้เกิดเอกสารเพิ่ม**
 *    (ต่างจากการสร้างใบใหม่ซึ่งกดสองครั้ง = ได้สองใบ)
 */
export async function zortEditQuotation(o = {}) {
  const id = txt(o.id, 40);
  if (!id) return { ok: false, error: "ต้องระบุ id ของใบ (ไม่ใช่เลขที่ใบ — คนละตัวกัน)" };
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return { ok: false, error: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด" };

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
    /* ⚠️ **บรรทัดในใบมี `id` ของตัวเอง ต่างจาก `id` ของหัวใบ** (เห็นจากของดิบ 6 ก.ย. 2569)
        หัวใบ id 974075 · บรรทัดในใบ id 3529927 — **คนละเลข คนละความหมาย ชื่อช่องเดียวกัน**
        เดาว่า `Invalid ID.` ที่โดนสองรอบหมายถึง **id ของบรรทัด** ไม่ใช่ของหัวใบ
        (เพราะหัวใบส่งเลขที่ ZORT คืนมาเองแล้วทั้งแบบข้อความและตัวเลข ยังไม่ผ่าน)
        ⇒ ให้ส่ง id ของบรรทัดไปด้วยได้ · ไม่ส่ง = ปล่อยให้ ZORT ตีความเอง (น่าจะเป็นบรรทัดใหม่)
        ⚠️ ยังเป็นสมมติฐาน **ต้องยิงจริงแล้วดึงกลับมาดูถึงจะรู้** */
    const lineId = numOrNull(it?.id);
    list.push({
      ...(lineId === null ? {} : { id: lineId }),
      sku,
      name: txt(it?.name, 200),
      number: qty,
      // กติกาเดียวกับตอนสร้าง — ZORT ไม่คิดยอดรวมบรรทัดให้เอง (ดูเหตุผลเต็มใน zortAddQuotation)
      ...(price === null ? {} : { pricepernumber: price, totalprice: qty * price }),
    });
  }

  /* ⚠️ **ส่ง id เป็น "ตัวเลข" ไม่ใช่ "ข้อความ"** — ZORT ตอบ `Invalid ID.` ถ้าส่งเป็นข้อความ
      (เจอจริง 6 ก.ย. 2569 · ส่ง "974075" ถูกปฏิเสธ ทั้งที่เป็นเลขใบเดียวกับที่ ZORT คืนมาเอง)
      ตอน ZORT สร้างใบให้ มันคืน `detail.id` มาเป็น **ตัวเลข** ⇒ ส่งกลับไปให้ตรงชนิดเดิม
      ⚠️ ยังรับ id ที่ไม่ใช่ตัวเลขไว้ด้วย เผื่อวันหน้า ZORT เปลี่ยนไปใช้รหัสตัวอักษร
      ✅ ข้อดีของรอบที่ถูกปฏิเสธ: **ปฏิเสธทั้งใบ ไม่ได้เขียนบางส่วนทิ้งไว้**
         ใบทดสอบยังเป็น ฿0 เท่าเดิม ไม่ได้เพี้ยนไปกว่าเดิม */
  const idNum = Number(id);
  const body = { id: Number.isFinite(idNum) && String(idNum) === id ? idNum : id, list };
  if (txt(o.customer)) body.customername = txt(o.customer, 160);

  if (!o.confirm)
    return { ok: true, dryRun: true, id, willSend: body,
      note: "โหมดซ้อม — ยังไม่ได้แก้ใน ZORT · ส่ง confirm:true เมื่อพร้อมแก้จริง" };

  const r = await zortPost("Quotation/EditQuotation", body);
  if (!r.ok) return { ok: false, id, unknown: !!r.unknown, error: r.error };
  return { ok: true, edited: true, id, lines: list.length, detail: r.detail,
    message: `แก้ใบเสนอราคา id ${id} (${list.length} บรรทัด) แล้ว — ` +
             `**ต้องดึงใบกลับมาดูก่อนเชื่อว่าเข้าถูกช่อง**` };
}

/**
 * ยกเลิกใบเสนอราคา (Quotation/VoidQuotation)
 *
 * 🛑 **ยกเลิกแล้วย้อนกลับไม่ได้** — ต้องส่ง `confirm: true` เสมอ
 * ⚠️ รับ **id** ไม่ใช่เลขที่ใบ — ส่งเลขที่ใบไปจะไม่เจอใบ (หรือแย่กว่านั้นคือไปโดนใบอื่น)
 *    ⇒ ผู้เรียกต้องหยิบ id มาจาก `list=quotations` เท่านั้น ห้ามเดาเอง
 */
export async function zortVoidQuotation(o = {}) {
  const id = txt(o.id, 40);
  if (!id) return { ok: false, error: "ต้องระบุ id ของใบ (ไม่ใช่เลขที่ใบ)" };
  // ⚠️ ชนิดของ id ต้องเป็นตัวเลขเหมือนกัน — ดูเหตุผลเต็มใน zortEditQuotation
  const idNum = Number(id);
  const sendId = Number.isFinite(idNum) && String(idNum) === id ? idNum : id;
  if (!o.confirm)
    return { ok: true, dryRun: true, id, willSend: { id: sendId },
      note: "โหมดซ้อม — ยังไม่ได้ยกเลิก · ยกเลิกแล้วย้อนไม่ได้ ส่ง confirm:true เมื่อแน่ใจ" };
  const r = await zortPost("Quotation/VoidQuotation", { id: sendId });
  if (!r.ok) return { ok: false, id, unknown: !!r.unknown, error: r.error };
  return { ok: true, voided: true, id, detail: r.detail,
    message: `ยกเลิกใบเสนอราคา id ${id} แล้ว — ควรดึงรายการมาดูว่าสถานะเปลี่ยนจริง` };
}

/* ⚠️⚠️ **บทเรียนแพงของวันนี้ (6 ก.ย. 2569): 404 ชื่อเดียว ≠ ไม่มี API**
    ZORT ใช้คำกริยาปนกันแล้วแต่โมดูล — บางที่ `Update*` บางที่ `Edit*` **ไม่มีกฎตายตัว**
    รอบแรกผมยิง `Quotation/UpdateQuotation` ได้ 404 แล้วสรุปว่า "แก้ใบเสนอราคาไม่ได้"
    ⇒ **ผิด** — `Quotation/EditQuotation` มีอยู่จริง · เกือบทำให้ฝั่งจอปิดงานทิ้งไป 3 แถว
    ที่ทำได้จริง (รวมถึง "คืนสินค้า" ซึ่งเป็นงานที่ร้านใช้จริง)

    ⇒ **กติกาก่อนจะประกาศว่า "ZORT ไม่เปิด API ให้"**
       ยิงให้ครบอย่างน้อย 4 รูป: `Add*` · `Update*` · `Edit*` · `Create*`
       และลองสะกดแบบตัวเล็ก/ใหญ่ต่างกันด้วย (`AddSalePage` vs `AddSalepage`)
       เจอ 404 ครบทุกชื่อถึงจะเขียนลงรายการนี้ได้ · เขียนชื่อที่ลองไว้ให้ครบด้วย
       ไม่งั้นคนอ่านจะไม่รู้ว่าเราลองแค่ชื่อเดียวหรือลองครบแล้ว */
export const ZORT_NO_API = [
  /* งานกระดาน t_mu0m99go (14 ก.ย. 2569) — ยืนยันจากเอกสารทางการ ไม่ใช่จากการเดาชื่อ */
  {
    what: "สร้างหมวดหมู่สินค้า",
    at: "2026-09-14",
    /* ⚠️ แก้ 14 ก.ย. 2569: เดิมเขียนชื่อเส้นอ่านหมวด (มีจริง) ไว้ในรูป โมดูล/ชื่อ ใน probe
        ⇒ zortclaims ยิงแล้วเจอว่ามี แล้วฟ้องว่า "คำกล่าวอ้างเป็นเท็จ" ทั้งที่จริง (แดงลวง)
        ⇒ probe ต้องมีแต่ชื่อที่อ้างว่า **ไม่มี** · เส้นที่มีจริงเขียนไว้ใน note แบบไม่มีเครื่องหมาย / */
    probe:
      "Product/AddCategory · Product/AddCategorys · Product/UpdateCategory · Product/DeleteCategory · " +
      "Category/AddCategory → ยังไม่เคยยิง (เอกสาร V4 หน้า Product ไม่มีเส้นสร้าง/แก้/ลบหมวดหมู่)",
    note:
      "หมวดใหม่เกิดได้ทางเดียวคือใส่ชื่อหมวดในช่อง `category` (String) ตอน AddProduct / UpdateProduct " +
      "⇒ จอ 'เพิ่มหมวดหมู่' ต้องบอกตรง ๆ และพาไปเพิ่ม/แก้สินค้าแทน ห้ามทำฟอร์มสร้างหมวดที่ไม่มีที่ส่ง " +
      "⚠️ ยังไม่ได้ยิงยืนยันว่า UpdateProduct ใส่ชื่อหมวดใหม่แล้ว ZORT สร้างหมวดให้เองจริง",
  },
  /* งานกระดาน t_mu0p3521 (14 ก.ย. 2569) — soon key: spread-setting
     ⚠️ ยืนยันจาก **เอกสาร** ครบทุกโมดูลในสารบัญแล้ว แต่ **ยังไม่ได้ยิง** (g1 ไม่มีรหัส ZORT)
     ⇒ ชื่อใน probe ข้างล่างคือชื่อที่ให้ zortclaims ยิงตรวจหลัง deploy · ต้องได้ 404 ทุกชื่อ ถึงจะถือว่าพิสูจน์แล้ว
     ⚠️ ห้ามใส่ชื่อเส้นที่มีจริงลงใน probe ของแถวนี้ (ตัวตรวจจะนับว่า "คำกล่าวอ้างเป็นเท็จ") */
  {
    what: "ตั้งค่ากระจายสินค้า (แบ่งสต็อกให้ช่องทางขาย/คลัง)",
    at: "2026-09-14",
    untested: true,
    probe:
      "Product/GetStockDistribution · Product/UpdateStockDistribution · Warehouse/GetStockDistribution · " +
      "Warehouse/UpdateStockDistribution · Merchant/GetStockDistribution · Merchant/UpdateStockSetting → ยังไม่เคยยิง",
    note:
      "เอกสาร ZORT API V4 อ่านครบ 14 โมดูลในสารบัญ (Product · Bundle · Warehouse · Contact · Order · Purchase Order · " +
      "Return Order · Return Purchase Order · Transfer · Quotation · Finance · File Upload · Document · Merchant) — " +
      "ไม่มีเส้นอ่าน/ตั้งค่ากระจายสินค้าเลยสักเส้น · หน้า Merchant มีแค่อ่านรายชื่อช่องทางขาย/ช่องทางส่ง/วิธีชำระ " +
      "⇒ จอ spread-setting ต้องขึ้นป้าย 'ทำไม่ได้จริง' พร้อมเหตุผลนี้ ห้ามทำฟอร์มหลอก",
  },
  /* ── งานกระดาน t_mu0qiwf1 (14 ก.ย. 2569): ตั้งค่า 6 ตัว + ผู้ใช้/สิทธิ์/เชื่อมต่อ/LeadTime ──
     ⚠️ ยืนยันจาก **เอกสาร V4 ครบ 14 โมดูล** · ชื่อใน probe = ชื่อที่ให้ zortclaims ยิงพิสูจน์ว่าได้ 404 หลัง deploy (ยังไม่เคยยิง)
     ⚠️ เส้นที่มีจริง (เส้นอ่านของ Merchant · ตรวจสลิปรายใบ) เขียนใน note แบบไม่มี / เท่านั้น — มีเทสกันแดงลวงแล้ว */
  {
    what: "ตั้งค่าโปรแกรม (ข้อมูลร้าน · ค่าเริ่มต้นของระบบ)", at: "2026-09-14", untested: true,
    probe: "Merchant/UpdateMerchantProfile · Merchant/GetSettings · Merchant/UpdateSettings · Setting/GetSettings → ยังไม่เคยยิง",
    note: "soon: setting-program · หน้า Merchant มีแค่อ่านข้อมูลร้าน (GetMerchantProfile) ไม่มีเส้นแก้ ⇒ จอแสดงข้อมูลร้านได้ แต่แก้ต้องไปทำใน ZORT",
  },
  {
    what: "ตั้งค่าเอกสาร (เลขที่ใบ · หัวกระดาษ · รูปแบบเอกสาร)", at: "2026-09-14", untested: true,
    probe: "Document/GetDocumentSettings · Document/UpdateDocumentSetting · Merchant/GetDocumentSetting → ยังไม่เคยยิง",
    note: "soon: setting-docs · โมดูล Document มีแค่อ่านเอกสารของออเดอร์และสร้างเอกสารให้ออเดอร์ ไม่มีเส้นตั้งค่ารูปแบบเอกสาร",
  },
  {
    what: "เพิ่ม/แก้ช่องทางการขาย", at: "2026-09-14", untested: true,
    probe: "Merchant/AddSalesChannel · Merchant/UpdateSalesChannel · Merchant/DeleteSalesChannel → ยังไม่เคยยิง",
    note: "soon: setting-channels · มีแค่เส้นอ่านรายชื่อ (GetSalesChannels) ⇒ จอแสดงรายการได้ แต่เพิ่ม/แก้ผ่าน API ไม่ได้",
  },
  {
    what: "เพิ่ม/แก้ช่องทางการจัดส่ง", at: "2026-09-14", untested: true,
    probe: "Merchant/AddShippingChannel · Merchant/UpdateShippingChannel · Merchant/DeleteShippingChannel → ยังไม่เคยยิง",
    note: "soon: setting-shipping · มีแค่เส้นอ่านรายชื่อ (GetShippingChannels · คืนแค่ id กับชื่อ) ⇒ จอแสดงรายการได้ แต่ตั้งค่าไม่ได้",
  },
  {
    what: "เพิ่ม/แก้วิธีชำระเงิน", at: "2026-09-14", untested: true,
    probe: "Merchant/AddPaymentMethod · Merchant/UpdatePaymentMethod · Merchant/DeletePaymentMethod → ยังไม่เคยยิง",
    note: "soon: setting-payment · มีแค่เส้นอ่านรายชื่อ (GetPaymentMethods) ⇒ จอแสดงรายการได้ แต่เพิ่ม/แก้ไม่ได้",
  },
  {
    what: "ตั้งค่าการตรวจสลิป", at: "2026-09-14", untested: true,
    probe: "Merchant/GetSlipSetting · Merchant/UpdateSlipSetting · Order/GetSlipSetting · Order/UpdateSlipSetting → ยังไม่เคยยิง",
    note: "soon: setting-slipcheck · ⚠️ มีเส้นตรวจสลิป **รายใบ** (โมดูล Order เส้น VerifyOrderSlip · ส่งไฟล์สลิปของออเดอร์นั้น) " +
      "แต่ไม่มีเส้นตั้งค่าการตรวจสลิป ⇒ ป้ายต้องแยก 'ตั้งค่าไม่ได้' ออกจาก 'ตรวจสลิปรายใบได้' ห้ามเขียนรวมว่าตรวจสลิปไม่ได้",
  },
  {
    what: "เพิ่มผู้ใช้ / เพิ่มสิทธิ์ (บทบาท) ใน ZORT", at: "2026-09-14",
    /* 🔴 ยิงจริงหลัง deploy 14 ก.ย. 2569 11:31: ชื่ออ่านรายชื่อผู้ใช้ในโมดูล Merchant **มีจริง** ทั้งที่ไม่อยู่ในเอกสาร V4 ทั้ง 14 โมดูล
        ⇒ เอกสารไม่ครบ · "ไม่พบในเอกสาร" ≠ "ไม่มี" · ย้ายชื่อนั้นไป ZORT_CAN_BUT_NOT_BUILT แล้ว (ห้ามอยู่ใน probe ของแถวนี้)
        ⇒ แถวนี้อ้างแค่ **เพิ่ม** ผู้ใช้/สิทธิ์ ไม่มี (ชื่อข้างล่างได้ 404 ครบ) */
    probe: "Merchant/AddUser · User/GetUsers · User/AddUser · Merchant/AddRole · Role/AddRole → 404 ครบ (ยิงจริง 14 ก.ย. 2569 หลัง deploy)",
    note: "soon: user-add · role-add · ✅ **อ่านรายชื่อผู้ใช้ได้** (Merchant เส้น GetUsers — ไม่มีในเอกสาร ยังไม่รู้รูปคำตอบ) แต่เพิ่มผู้ใช้/สิทธิ์ไม่พบ · " +
      "⚠️ แยกจากผู้ใช้หลังร้านของเราเอง (คนละเรื่อง คนละคีย์): **หน้าเพิ่มผู้ใช้หลังร้านมีแล้ว** ตั้งแต่ gucut-next da2b0e0 (12 ก.ย. 2569 · " +
      "/core/settings-users/add · soon key setting-users) แต่ผู้ใช้ทุกคนได้ **สิทธิ์เท่าพนักงานเป๊ะ** (หน้าโอนสินค้าเท่านั้น) · แอดมินมาจาก env " +
      "⇒ ที่ยังไม่มีคือ **ระดับสิทธิ์ใหม่** ต้องแก้โค้ด middleware.ts ต้องให้ท่านประธานตัดสินก่อน ห้ามทำฟอร์มหลอก " +
      "(แก้ 14 ก.ย. 2569: เดิมเขียนว่ามีแค่พนักงาน env — อ่านจากคอมเมนต์เก่าใน middleware · คุณส้มจับได้)",
  },
  {
    what: "เพิ่มการเชื่อมต่อร้านค้า (Shopee · Lazada · TikTok ฯลฯ) ผ่าน ZORT", at: "2026-09-14", untested: true,
    probe: "Merchant/GetConnections · Merchant/AddConnection · Connection/GetConnections · Connection/AddConnection → ยังไม่เคยยิง",
    note: "soon: connection-add · ไม่มีเส้นใดใน 14 โมดูล · ของเราต่อ API มาร์เก็ตเพลสตรงเองอยู่แล้ว (Shopee/Lazada เชื่อมแล้ว · TikTok รอตรวจ) ไม่ต้องผ่าน ZORT",
  },
  {
    what: "LeadTime (ระยะเวลารอของจากผู้ขาย)", at: "2026-09-14", untested: true,
    probe: "Product/GetLeadTime · Product/UpdateLeadTime · PurchaseOrder/GetLeadTime → ยังไม่เคยยิง",
    note: "soon: leadtime · ไม่พบคำว่า lead time ในหน้า Product · Order · Purchase Order · ท่อของเราก็ยังไม่ได้คิด lead time ที่ไหนเลย " +
      "(grep ทั้ง netlify/ ไม่เจอ 14 ก.ย.) ⇒ ทางที่เป็นไปได้คือคิดเองจากประวัติใบซื้อ (วันสร้างใบ → วันรับของ) เป็นงานใหม่ ไม่ใช่ของ ZORT",
  },
  {
    what: "สร้าง/แก้สินค้าหลากคุณสมบัติ (ตัวเลือกย่อยของสินค้า)", at: "2026-09-14", untested: true,
    probe: "Product/AddVariation · Product/AddVariant · Product/UpdateVariation · Product/AddProductVariant · " +
      "Variation/AddVariation → ยังไม่เคยยิง",
    note: "soon: product-variant · เอกสาร V4 หน้า Product มีแค่เส้นอ่าน GetVariations (และตัวกรอง variationid ของ GetProducts) · " +
      "ช่องของ AddProduct / UpdateProduct ไม่มีเรื่องตัวเลือกย่อยเลย ⇒ จอแสดงตัวเลือกที่มีอยู่ได้ แต่สร้าง/แก้ต้องทำใน ZORT",
  },
  {
    what: "แก้ / ยกเลิกใบเสนอราคา (เส้นมีจริง แต่ยิงแล้วไม่ผ่าน)",
    at: "2026-09-06",
    /* ⚠️ แก้ 14 ก.ย. 2569: แถวนี้คือ "เส้นมีจริงแต่ใช้ไม่ได้" ไม่ใช่ "ไม่มีเส้น"
        zortclaims ถือว่าทุกชื่อใน probe ของรายการนี้ต้องได้ 404 ⇒ เขียนชื่อเส้นในรูป โมดูล/ชื่อ = แดงลวงทุกรอบ
        ⇒ เขียนชื่อแบบไม่มี / เพื่อไม่ให้ถูกยิงตรวจ (ยิงตรวจไม่มีความหมาย เพราะเรารู้อยู่แล้วว่าเส้นมีจริง) */
    probe:
      "โมดูล Quotation เส้น EditQuotation และ VoidQuotation → **405** (เส้นมีจริง เป็นเส้นเขียน) · " +
      "POST ทั้งสองเส้น 4 รอบ ด้วย id ทุกแบบที่มี → **'Invalid ID.' (resCode 100) ทุกครั้ง**",
    note:
      "ลองครบทุกค่าที่เป็นไปได้แล้ว: id หัวใบเป็นตัวเลข (974075) · เป็นข้อความ · " +
      "เลขที่ใบ (QT-202609001) · และแนบ id ของบรรทัด (3529927) ไปด้วย — ปฏิเสธหมด " +
      "⚠️ **เลข 974075 ตัวเดียวกันนี้ใช้กับ GET Quotation/GetQuotationDetail ได้ปกติ** " +
      "และเป็นเลขที่ ZORT คืนมาเองตอน AddQuotation ⇒ ไม่ใช่ว่าเราถือเลขผิด " +
      "⇒ เส้นเขียนสองตัวนี้ **น่าจะไม่เปิดให้บัญชี/แพ็กเกจของเรา** หรือใช้ชื่อช่องอื่นที่ยังหาไม่เจอ " +
      "🚫 **ห้ามไล่เดาชื่อช่องต่อ** — ทุกครั้งที่เดาต้อง deploy ใหม่ และถ้าบังเอิญเดาถูกแบบผิดรูป " +
      "อาจไปทับเอกสารจริงของร้าน · จะไปต่อต้องหาเอกสาร API ของ ZORT หรือถามผู้ให้บริการ " +
      "✅ ผลข้างเคียงที่ดี: ทุกครั้งที่โดนปฏิเสธ **ไม่มีอะไรถูกเขียนบางส่วน** ดึงใบกลับมาดูแล้วค่าเดิมครบ",
  },
  /* ⚠️ ทุกแถวในนี้ต้องผ่าน "การพิสูจน์ว่าไม่มี" แบบเต็ม — ยิงหลายชื่อ หลายโมดูล **และหลาย method**
      (เบาะแสสำคัญ: ยิงผิด method ได้ **405** ซึ่งแปลว่าเส้นมีจริง ต่างจาก **404** ที่แปลว่าไม่มี) */
  {
    what: "เซลเพจ (สร้าง/แก้/อ่าน)",
    at: "2026-09-06",
    probe:
      "POST SalePage/AddSalePage · AddSalepage · CreateSalePage → 404 · " +
      "GET SalePage/GetSalePages · SalePage/GetList → 404",
  },
  {
    what: "กลุ่มลูกค้า",
    at: "2026-09-06",
    probe:
      "GET ContactGroup/GetContactGroups · Contact/GetContactGroups · Contact/GetGroups · " +
      "Contact/GetContactGroupList · Contact/GetGroupList · ContactGroup/GetList → 404 ทั้งหมด",
    note: "Contact/GetContacts มีจริง แต่วัตถุผู้ติดต่อไม่มีช่องกลุ่มเลย และช่อง type เป็น 'Undefined' ทุกราย",
  },
  {
    what: "ตัวแทนจำหน่าย",
    at: "2026-09-06",
    probe: "GET Contact/GetAgents · Agent/GetAgents · Contact/GetAgentList → 404",
  },
  {
    what: "ดรอปชิป / หน้าสั่งซื้อ",
    at: "2026-09-06",
    probe: "GET Dropship/GetDropships · Dropship/GetList · Contact/GetDropshipList → 404",
  },
  {
    what: "ราคาตามระดับลูกค้า (TierPrice)",
    at: "2026-09-06",
    probe: "GET TierPrice/GetTierPrices · Contact/GetTierPrices → 404",
  },
];

/* เส้นที่ **มีจริง** แต่เรายังไม่ได้เขียนตัวเรียก — ต่างจากรายการข้างบนคนละเรื่อง
   ⚠️ เพิ่มฟังก์ชันเขียนตัวใหม่เมื่อไหร่ **ลบแถวของมันออกจากรายการนี้ในคอมมิตเดียวกัน**
      (เจอของจริงวันนี้: "สร้างใบเสนอราคา" ค้างอยู่ทั้งที่ทำเสร็จแล้ว) */
/** วิธียิงตรวจ + **ตัวคุมกลุ่ม** — จอเอาไปโชว์คู่กับผลได้ ให้คนอ่านชั่งน้ำหนักหลักฐานเองเป็น
 *  ⚠️ ผลยิงตรวจที่ไม่มีตัวคุมกลุ่มกำกับ **ห้ามเอาไปตัดงานทิ้ง**
 *     6 ก.ย. 2569 เกือบพลาดสองแถว ("รับคืนสินค้า" · "แก้ใบสั่งซื้อ") เพราะยิงชื่อเดียวแล้วสรุปเลย
 *     ทั้งคู่มีเส้นอยู่จริงแค่คนละชื่อ/คนละโมดูล ⇒ 404 ชื่อเดียว **ไม่ใช่หลักฐานพอ**
 *  ⚠️ ขอบเขตข้อสรุปของทั้งไฟล์นี้: "ไม่พบภายใต้ชื่อที่ลอง" ไม่ใช่ "ไม่มีแน่นอน" */
/* วิธียิงตรวจว่า "เส้นนี้มีอยู่จริงไหม" — ทำซ้ำได้ ไม่ต้องใช้รหัสร้าน ไม่สร้างข้อมูล
   สคริปต์พร้อมใช้: ~/claude-shared/zort-probe.sh */
export const ZORT_PROBE_METHOD = {
  /* ⚠️ **ยิงด้วย GET เท่านั้น ห้าม POST** (เปลี่ยนวิธี 6 ก.ย. 2569 เช้า)
      ZORT **ตอบ HTTP 200 ให้แทบทุกอย่าง** ⇒ POST ไปที่ `AddXxx` แล้วได้ 200
      **แยกไม่ออกว่า "ถูกปฏิเสธ" หรือ "สร้างเอกสารจริงไปแล้ว"** จนกว่าจะอ่านเนื้อคำตอบ
      วิธีเดิม (POST body {} ไม่ใส่คีย์) ปลอดภัยเพราะโดนตีตกที่ชั้นคีย์ก่อน — แต่
      **ความปลอดภัยไปแขวนอยู่กับ "อย่าเผลอใส่คีย์"** ซึ่งเป็นเงื่อนไขที่พลาดได้
      GET แยกได้เท่ากันโดยไม่ต้องพึ่งเงื่อนไขนั้นเลย */
  how: "GET ที่ path ตรง ๆ ไม่ใส่คีย์ ไม่มี body — อ่านแค่ HTTP status",
  read: {
    "200": "เส้นมีจริง + รับ GET (เนื้อคำตอบจะบอกว่าไม่ได้ใส่คีย์)",
    "405": "เส้นมีจริง แต่เป็นเส้นเขียน (รับเฉพาะ POST) ⇒ **ห้ามสรุปว่าไม่มี**",
    "404": "ไม่พบเส้นนั้น",
  },
  /* ⚠️ ต้องยิงตัวควบคุมคู่กันทุกครั้ง ไม่งั้นสคริปต์พังแล้วได้ 404 ทั้งกระดาน
      = "ไม่มีอะไรเลย" ซึ่งหน้าตาเหมือนผลตรวจที่สมบูรณ์แบบ */
  control: [
    "บวก: Order/GetOrders → 200 · Order/AddOrder → 405 · Webhook/GetWebhook → 200",
    "ลบ: Zzz/GetNothing → 404",
  ],
  nameShapes: [
    "Module/GetXxxs", "Module/GetXxxList", "Module/list", "Module/GetList",
    "Module/EditXxx (ไม่ใช่ Update เสมอไป)", "Module/VoidXxx", "Module/DeleteXxx",
    // ⚠️ รูปเอกพจน์มีจริง — `Webhook/GetWebhook` ไม่ใช่ `GetWebhooks` (เจอ 6 ก.ย. 2569)
    "Module/GetXxx (เอกพจน์ ไม่เติม s)",
    "โมดูลอื่นที่ชื่อใกล้เคียง · ชื่อโมดูลมักตรงกับ URL ของจอใน ZORT",
  ],
  caveat: "พิสูจน์ได้แค่ 'ไม่พบภายใต้ชื่อที่ลอง' ไม่ใช่ 'ไม่มีแน่นอน'",
  at: "2026-09-06",
};

/* ⚠️ **กติกาการเขียนช่อง `probe` ของรายการนี้ — ผิดแล้วตาข่ายพังเงียบ**
   `zort-claim-check.mjs` อ่าน **ชื่อเส้นตัวแรก** ในข้อความ `probe` แล้วเอาไปยิงตรวจว่ายังมีอยู่ไหม
   ⇒ **ชื่อแรกต้องเป็นเส้นที่ "มีจริง" เสมอ** ห้ามขึ้นต้นด้วยชื่อที่ 404
   เขียนสลับเมื่อไหร่ ตาข่ายจะรายงานว่า "ความสามารถหายไปแล้ว" ทุกรอบ (ฟ้องผิด)
   หรือแย่กว่านั้นคือเงียบไปเลย ⇒ ชื่อที่ไม่มีให้เขียนไว้ในวงเล็บท้ายเสมอ
   ตัวอย่างที่ถูก: "Quotation/EditQuotation → 405 (UpdateQuotation = 404 คนละชื่อ)" */
export const ZORT_CAN_BUT_NOT_BUILT = [
  { what: "เพิ่ม/แก้ผู้ติดต่อ (ลูกค้า · คู่ค้า)", at: "2026-09-06", untested: true,
    probe: "Contact/AddContact · Contact/UpdateContact → resCode 100 (Contact/EditContact = 404)" },
  { what: "แก้ข้อมูลสินค้าที่มีอยู่แล้ว", at: "2026-09-06", untested: true,
    probe: "Product/UpdateProduct → resCode 100 (Product/EditProduct = 404)" },
  /* ⚠️ **ข้อสรุปเดียวของเรื่อง "ใบเสนอราคาแก้ทีหลังได้ไหม"** — เคยส่งข้อความขัดกันเองไปสองใบ
      (6 ก.ย. 2569 · ฝั่งจอทักมาถูก) ⇒ ต่อจากนี้ยึดบรรทัดนี้ที่เดียว
      "มีเส้นสำหรับแก้ แต่ยังไม่เคยยิงจริง" ≠ "แก้ได้" และ ≠ "แก้ไม่ได้" — สามสถานะ */
  /* 🔴 **ยิงจริงแล้ว 6 ก.ย. 2569 — ไม่ผ่าน** ⇒ เลิกสถานะ "ยังไม่เคยยิง" ได้แล้ว
      ลอง 4 รอบ: id หัวใบเป็นตัวเลข · เป็นข้อความ · เลขที่ใบ · แนบ id ของบรรทัดไปด้วย
      → `Invalid ID.` (resCode 100) ทุกรอบ · เลขเดียวกันนี้ GET ได้ปกติและ ZORT คืนมาเอง
      ⇒ **แก้ใบที่สร้างแล้วไม่ได้จริง ๆ** ⇒ ต้องทำใบให้ถูกตั้งแต่แรก (ไม่ใช่คำแนะนำชั่วคราวอีกต่อไป)
      ✅ ทุกรอบที่ถูกปฏิเสธ **ไม่มีอะไรถูกเขียนบางส่วน** — ดึงใบกลับมาดูแล้วค่าเดิมครบ */
  { what: "แก้ใบเสนอราคาที่สร้างแล้ว", at: "2026-09-06", tested: true, works: false,
    probe: "POST Quotation/EditQuotation × 4 รูปแบบ id → 'Invalid ID.' ทุกครั้ง",
    note: "เส้นมีจริง (405) แต่ปฏิเสธ id ทุกแบบที่เรามี — น่าจะไม่เปิดให้บัญชี/แพ็กเกจของเรา" },
  { what: "แก้ใบสั่งซื้อที่สร้างแล้ว", at: "2026-09-06", untested: true,
    probe: "PurchaseOrder/EditPurchaseOrder → resCode 100 (UpdatePurchaseOrder = 404)" },
  { what: "รับคืนสินค้า", at: "2026-09-06", untested: true,
    probe: "ReturnOrder/AddReturnOrder → resCode 100 (Order/AddReturnOrder = 404 คนละโมดูล)",
    note: "แถวนี้เกือบถูกปิดเป็น ❌ เพราะยิงผิดโมดูล — ของจริงทำได้" },
  { what: "แก้ออเดอร์ที่ส่งเข้าไปแล้ว", at: "2026-09-06", untested: true,
    probe: "Order/EditOrder → resCode 100" },

  /* ── กวาดทั้งแผง 6 ก.ย. 2569 เช้า · GET-only 140+ ชื่อ · ตัวควบคุมผ่าน ────────────
     ที่มา: ยิงคู่ (โมดูล × คำกริยา) แทนการนึกชื่อทีละตัว — วิธีนึกทีละตัวพลาดมาแล้ว 3 รอบ
     ⚠️ ทุกตัวข้างล่างนี้ **ยังไม่เคยยิงจริง** รู้แค่ว่า "เส้นมีอยู่" (ได้ 405 = เส้นเขียน)
        ห้ามเอาไปเขียนบนจอว่าทำได้ จนกว่าจะยิงของจริงแล้วสำเร็จ */

  /* 🔴 ตัวนี้ปิดช่องที่ CLAUDE.md เขียนไว้ว่า "ยกเลิกบนเว็บไม่ยกเลิกใน ZORT ต้องไปยกเลิกเอง"
      ถ้ายิงแล้วผ่าน = ลูกค้ากดยกเลิกบนเว็บแล้วใบใน ZORT ตายตามทันที ไม่ต้องมีคนไปกดมือ
      ⚠️ **ห้ามต่อเข้าปุ่มยกเลิกอัตโนมัติก่อนยิงทดสอบ** — ยกเลิกใบผิดเอาคืนไม่ได้ */
  { what: "ยกเลิกออเดอร์ใน ZORT", at: "2026-09-06", untested: true,
    probe: "Order/VoidOrder → 405 (เส้นเขียนมีจริง)",
    note: "ปิดช่องที่ต้องไปกดยกเลิกเองใน ZORT ทุกครั้งที่ลูกค้ายกเลิกบนเว็บ" },
  { what: "เปลี่ยนสถานะออเดอร์", at: "2026-09-06", untested: true,
    probe: "Order/UpdateOrderStatus → 405" },
  { what: "สร้าง/แก้/ยกเลิก ใบโอนสินค้าระหว่างคลัง", at: "2026-09-06", untested: true,
    probe: "Transfer/AddTransfer · EditTransfer · VoidTransfer · UpdateTransferStatus → 405 ทั้งหมด",
    note: "จอ /core/receive ตอนนี้อ่านใบอย่างเดียว — เส้นสร้างใบมีอยู่แล้ว" },
  { what: "สร้าง/แก้/ลบ สินค้าเป็นชุด (Bundle)", at: "2026-09-06", untested: true,
    probe: "Bundle/AddBundle · UpdateBundle · DeleteBundle → 405" },
  { what: "เพิ่มคลังสินค้า", at: "2026-09-06", untested: true,
    probe: "Warehouse/AddWarehouse → 405 (Warehouse/GetWarehouses → 200)" },
  { what: "บันทึกรับชำระเงิน", at: "2026-09-06", untested: true,
    probe: "Payment/AddPayment → 405 · Payment/GetPaymentDetail → 200",
    note: "⚠️ ไม่มีเส้น 'รายการชำระทั้งหมด' — GetPayments/GetPaymentList = 404 ทั้งคู่ ⇒ ดูได้ทีละใบเท่านั้น" },
  /* 🔴 ยิงจริงแล้ว — ยกเลิกใบเสนอราคาไม่ผ่านเช่นกัน (payload มีแค่ id ตัวเดียว)
      ⇒ ตัวแปรเดียวคือค่า id และปฏิเสธทั้งสองค่าที่เรามี ⇒ ไม่ใช่เรื่องรูปแบบ payload
      ⚠️ อีกสองใบ (ใบสั่งซื้อ · ใบคืนสินค้า) **ยังไม่เคยยิง** — ห้ามเหมาว่าพังตามกัน */
  { what: "ยกเลิกใบเสนอราคา (ยิงจริงแล้ว ไม่ผ่าน)", at: "2026-09-06", tested: true, works: false,
    probe: "POST Quotation/VoidQuotation ด้วย id ตัวเลขและเลขที่ใบ → 'Invalid ID.' ทั้งคู่",
    note: "⇒ ใบทดสอบต้องเข้าไปกดยกเลิกในหน้าจอ ZORT เอง" },
  { what: "ยกเลิกใบสั่งซื้อ / ใบคืนสินค้า", at: "2026-09-06", untested: true,
    probe: "PurchaseOrder/VoidPurchaseOrder · ReturnOrder/VoidReturnOrder → 405 (ยังไม่เคยยิงจริง)" },
  { what: "ลบสินค้า", at: "2026-09-06", untested: true,
    probe: "Product/DeleteProduct → 405",
    note: "⚠️ ของร้านจริง ลบพลาดเอาคืนไม่ได้ — ต่อเข้าจอต้องมีขั้นยืนยันเสมอ · " +
      "ท่อมีแล้ว 14 ก.ย. 2569: DELETE ?deleteproduct=<id> (ตรวจ id↔sku + สต็อก 0 ก่อนลบ · ยังไม่เคยยิงจริง)" },
  /* 🔎 เจอจากการยิงจริงหลัง deploy 14 ก.ย. 2569 11:31 — **ไม่มีในเอกสาร ZORT API V4** (อ่านครบ 14 โมดูลแล้วไม่เจอ)
      ⇒ เอกสารไม่ครบ ต้องยิงพิสูจน์เสมอ · ยังไม่รู้รูปคำตอบ/พารามิเตอร์ ห้ามทำจอพึ่งจนกว่าจะอ่านคำตอบจริงด้วยรหัสร้าน */
  { what: "อ่านรายชื่อผู้ใช้ของร้านใน ZORT (เส้นไม่มีในเอกสาร)", at: "2026-09-14", untested: true,
    probe: "Merchant/GetUsers → มีจริง (zortclaims ยิงเปล่าไม่ใส่คีย์ได้ exists) · ยังไม่เคยอ่านคำตอบด้วยรหัสร้าน",
    note: "ใช้ได้กับ soon user-add ในแง่ 'แสดงรายชื่อผู้ใช้' เท่านั้น · เพิ่มผู้ใช้/สิทธิ์ยังไม่พบ (ดูแถว ZORT_NO_API)" },
  /* งานกระดาน t_mu0p3521 — ท่อไม่ทำโดยตั้งใจ: เรียกขนส่งจริง/อาจมีค่าใช้จ่าย ⇒ ต้องให้ท่านประธานอนุมัติก่อน */
  { what: "จองขนส่ง / เรียกรถเข้ารับ / ปริ้นใบปะหน้า", at: "2026-09-14", untested: true,
    probe: "Order/BookOrderShipment → เอกสาร V4 (ยังไม่เคยยิง) · Order/ReadyToShip · Order/GetShipmentLabels",
    note: "BookOrderShipment รับ shipment = thailandpost|flashexpress|kerry|shopeeexpress|dhl · ReadyToShip มี booking=1 " +
      "= เรียกผู้ให้บริการขนส่งจริง ⇒ ไม่ทำเส้นเขียนจนกว่าท่านประธานอนุมัติ · ส่วนบันทึกเลขพัสดุเอง ใช้ ?ordershipping=1 (EditOrderInfo)" },
];

/* 🔔 **ZORT ยิงเหตุการณ์กลับมาหาเราได้** — เจอ 6 ก.ย. 2569 ตอนกวาดทั้งแผง
   `Webhook/GetWebhook` → 200 · `Webhook/UpdateWebhook` → 405 (เส้นเขียน)
   ⚠️ ยังไม่รู้ว่ามันยิงเหตุการณ์อะไรได้บ้าง และรูปคำขอหน้าตายังไง — **ต้องยิงอ่านของจริงก่อน**
   ถ้าใช้ได้จริง ผลคือ **เลิกนั่งถาม ZORT ทุก 30 นาที** ทั้งระบบ:
     - ออเดอร์เปลี่ยนสถานะ/จัดส่ง รู้ทันทีแทนที่จะรู้ช้าได้ถึงครึ่งชั่วโมง
     - กระจกออเดอร์ไม่ต้องกวาดย้อนหลังเผื่อทุกรอบ
   ⚠️ **ห้ามตั้ง webhook ทับของเดิมเด็ดขาดจนกว่าจะอ่านค่าปัจจุบันออกมาดูก่อน**
      ZORT Social Commerce / ตัวเชื่อมมาร์เก็ตเพลสอาจตั้ง URL ไว้อยู่แล้ว
      ทับ = ของที่ร้านใช้หากินอยู่ทุกวันพังเงียบ ๆ (กติกาเดียวกับห้ามแตะ webhook ของ @gucut1) */
export const ZORT_WEBHOOK = {
  found: "2026-09-06",
  read: "GET Webhook/GetWebhook",
  write: "POST Webhook/UpdateWebhook",
  status: "ยังไม่เคยอ่านค่าจริง — ยังไม่รู้ว่าตั้งอะไรไว้อยู่",
  untested: true,
};

/** อ่านรายการจากโมดูล `Document` ของ ZORT — **อ่านอย่างเดียว**
 *  เจอ 6 ก.ย. 2569 ตอนกวาดชื่อโมดูลตาม URL ของจอ · มีแค่เส้นอ่าน (Add/Edit/Delete = 404)
 *  ⚠️ ยังไม่รู้ว่าเป็น "เอกสารบัญชี" หรือ "ไฟล์แนบ/สลิป" ⇒ **ห้ามแกะฟิลด์ตามชื่อที่เดาเอง**
 *     ส่งของดิบ + รายชื่อช่องที่ได้จริงกลับไป ให้คนดูตัดสินเอง
 *     (เดารูปแล้วอ่านไม่เจอ จะกลายเป็น "ไม่มีข้อมูล" ซึ่งชวนสรุปผิดว่ายังต้องคัดมือ) */
/**
 * พิสูจน์: เอกสาร 694 ใบ (ใบเสร็จ/ใบส่งสินค้า/ใบกำกับภาษี) **สร้างใหม่จากกระจกเราได้ไหม**
 *
 * ที่มา: ตัวไฟล์ PDF โหลดไม่ได้ (linkurl คืน HTML — พิสูจน์แล้วทั้งรหัส API และ
 * เบราว์เซอร์ล็อกอิน · สาเหตุยังไม่รู้) ⇒ ทางรอดคือ "สร้างใหม่จากข้อมูลต้นทาง"
 * ซึ่งจะทำได้ก็ต่อเมื่อ **ทุกใบอ้างอิงถึงใบขาย/ใบสั่งซื้อที่กระจกเรามีครบพร้อมรายการสินค้า**
 *
 * วิธีพิสูจน์: ดึงสารบัญครบทุกหน้า → แยก referencenumber → เทียบกับ D1 สามชั้น
 *   ① หัวใบมีไหม (orders / purchase_orders) ② มีรายการสินค้าไหม (order_items /
 *   purchase_order_items) — หัวใบเฉย ๆ สร้างใบเสร็จไม่ได้
 * ⚠️ ใบที่เทียบไม่ติด = **นับแยกพร้อมรายชื่อ ห้ามกลืน** — คำตอบ "สร้างได้ 90%"
 *   ที่ไม่บอกว่า 10% คือใบไหน ใช้ตัดสินใจไม่ได้
 * ⚠️ นี่พิสูจน์แค่ "ข้อมูลพอ" — **ไม่ได้พิสูจน์ว่าหน้าตา/เลขที่เอกสารตรงกับใบเดิม**
 *   และใบกำกับภาษีที่ออกให้ลูกค้าแล้วมีประเด็นกฎหมายแยกต่างหาก (ต้องถามเจ้าของร้าน/PEAK)
 */
export async function zortDocCoverage() {
  const headers = creds();
  if (!headers) return { ok: false, error: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };

  /* ── ① สารบัญครบทุกหน้า — หน้าแรกเอา count ที่เหลือยิงพร้อมกัน ── */
  const per = 100;
  const page1 = await fetch(`${BASE}/Document/GetDocuments?limit=${per}&page=1`, {
    headers, signal: AbortSignal.timeout(15000),
  }).then((r) => r.json()).catch(() => null);
  const total = num(page1?.count);
  const rows = Array.isArray(page1?.list) ? [...page1.list] : [];
  if (!total || !rows.length) return { ok: false, error: "อ่านสารบัญเอกสารจาก ZORT ไม่ได้" };
  const lastPage = Math.min(12, Math.ceil(total / per));
  const rest = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) =>
      fetch(`${BASE}/Document/GetDocuments?limit=${per}&page=${i + 2}`, {
        headers, signal: AbortSignal.timeout(15000),
      }).then((r) => r.json()).catch(() => null)
    )
  );
  for (const d of rest) if (Array.isArray(d?.list)) rows.push(...d.list);
  /* 🔴 ดึงไม่ครบต้องบอก — coverage ที่คิดจากสารบัญไม่ครบคือคำตอบผิดที่ดูสมบูรณ์ */
  const indexComplete = rows.length >= total;

  /* ⚠️ **ต้องเทียบด้วยสองคีย์** (บทเรียนยิงจริงรอบแรก 7 ก.ย. 2569):
      รอบแรกเทียบแค่ referencenumber ↔ orders.number ได้ผลสุดขั้ว 4/694
      เพราะใบขายมาร์เก็ตเพลส referencenumber เป็นเลขออเดอร์ของแพลตฟอร์ม
      (เช่น 564792687800680 ของ Lazada) ไม่ใช่เลขใบ ZORT
      ⇒ คีย์หลักที่ถูกคือ **referenceid ↔ orders.id** (id ภายใน ZORT ทั้งคู่)
      ([[new-columns-need-backfill]]: "ผลสุดขั้ว 0%/100% = เทียบผิดคีย์" — ตรงเป๊ะ) */
  const docs = rows.map((r) => ({
    header: String(r?.header ?? ""),
    doc: String(r?.documentnumber ?? ""),
    ref: String(r?.referencenumber ?? "").trim(),
    refid: String(r?.referenceid ?? "").trim(),
    reftype: num(r?.referencetype),
    year: String(r?.documentdate ?? "").slice(0, 4) || "?",
  }));

  /* ── ② เทียบกับกระจก — ถามเป็นชุด IN(...) ไม่ถามทีละใบ (โควตา D1) ── */
  const { coreQuery, coreReady } = await import("./coredb.mjs");
  if (!coreReady()) return { ok: false, error: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const refs = [...new Set(docs.map((d) => d.ref).filter(Boolean))];
  const refids = [...new Set(docs.map((d) => d.refid).filter(Boolean))];
  const chunk = (arr) => {
    const out = [];
    for (let i = 0; i < arr.length; i += 80) out.push(arr.slice(i, i + 80));
    return out;
  };

  const inOrders = new Set();       // หัวใบขายมี (เทียบด้วยเลขใบ)
  const withOrderItems = new Set(); // และมีรายการสินค้า
  const inOrderIds = new Set();     // หัวใบขายมี (เทียบด้วย referenceid — คีย์หลัก)
  const withOrderIdItems = new Set();
  const inPOs = new Set();
  const withPOItems = new Set();
  for (const c of chunk(refs)) {
    const ph = c.map(() => "?").join(",");
    const [o, oi, p2, pi] = await Promise.all([
      coreQuery(`SELECT number FROM orders WHERE number IN (${ph})`, c),
      coreQuery(
        `SELECT DISTINCT o.number AS number FROM orders o
         JOIN order_items i ON i.order_id = o.id WHERE o.number IN (${ph})`, c),
      coreQuery(`SELECT number FROM purchase_orders WHERE number IN (${ph})`, c),
      coreQuery(
        `SELECT DISTINCT number FROM purchase_order_items WHERE number IN (${ph})`, c),
    ]);
    for (const r of o ?? []) inOrders.add(String(r.number));
    for (const r of oi ?? []) withOrderItems.add(String(r.number));
    for (const r of p2 ?? []) inPOs.add(String(r.number));
    for (const r of pi ?? []) withPOItems.add(String(r.number));
  }
  for (const c of chunk(refids)) {
    const ph = c.map(() => "?").join(",");
    const [o, oi] = await Promise.all([
      coreQuery(`SELECT id FROM orders WHERE id IN (${ph})`, c),
      coreQuery(
        `SELECT DISTINCT o.id AS id FROM orders o
         JOIN order_items i ON i.order_id = o.id WHERE o.id IN (${ph})`, c),
    ]);
    for (const r of o ?? []) inOrderIds.add(String(r.id));
    for (const r of oi ?? []) withOrderIdItems.add(String(r.id));
  }

  /* ── ③ ตัดเกรดรายใบ ── */
  let full = 0, headerOnly = 0, missing = 0, noRef = 0;
  const missingList = [], headerOnlyList = [];
  /* แยกใบที่เทียบไม่ติดตามปีเอกสาร — ตอบว่า "ติดเพราะกระจกประวัติสั้น" กี่ใบ */
  const missingByYear = {};
  for (const d of docs) {
    if (!d.ref && !d.refid) { noRef += 1; missingList.push(`${d.doc} (${d.header} — ไม่มีเลขอ้างอิง)`); continue; }
    const hasHead = inOrderIds.has(d.refid) || inOrders.has(d.ref) || inPOs.has(d.ref);
    const hasLines = withOrderIdItems.has(d.refid) || withOrderItems.has(d.ref) || withPOItems.has(d.ref);
    if (hasHead && hasLines) full += 1;
    else if (hasHead) { headerOnly += 1; headerOnlyList.push(`${d.doc} → ${d.ref}`); }
    else {
      missing += 1;
      missingByYear[d.year] = (missingByYear[d.year] ?? 0) + 1;
      missingList.push(`${d.doc} → ${d.ref} (${d.header} · ${d.year})`);
    }
  }

  return {
    ok: true,
    totalDocs: total,
    indexed: rows.length,
    /* 🔴 สารบัญไม่ครบ = ตัวเลขทุกตัวข้างล่างเป็นของ "เท่าที่เห็น" ห้ามอ่านเป็นทั้งกอง */
    indexComplete,
    refsDistinct: refs.length,
    สร้างใหม่ได้: full,
    หัวใบมีแต่ไม่มีรายการ: headerOnly,
    เทียบไม่ติด: missing,
    ไม่มีเลขอ้างอิง: noRef,
    เทียบไม่ติดแยกตามปี: missingByYear,
    headerOnlyList: headerOnlyList.slice(0, 40),
    missingList: missingList.slice(0, 40),
    verdict:
      !indexComplete
        ? "ยังตอบไม่ได้ — สารบัญดึงมาไม่ครบ"
        : missing + noRef + headerOnly === 0
          ? "ทุกใบมีข้อมูลต้นทางครบในกระจก (หัวใบ+รายการสินค้า) ⇒ สร้างใหม่ได้เชิงข้อมูล"
          : `สร้างใหม่ได้ ${full}/${docs.length} ใบ · ที่เหลือดูรายชื่อใน missingList/headerOnlyList`,
    note:
      "พิสูจน์แค่ 'ข้อมูลพอสร้าง' — ไม่ได้พิสูจน์ว่าหน้าตา/เลขที่ตรงใบเดิม " +
      "และใบกำกับภาษีที่ออกให้ลูกค้าแล้วมีประเด็นกฎหมายแยก ต้องถามเจ้าของร้าน/PEAK",
  };
}

export async function zortDocumentsRead(limitRaw) {
  const headers = creds();
  if (!headers) return { ok: false, error: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  const per = Math.max(1, Math.min(100, Number(limitRaw) || 100));

  /* ⚠️ **ต้องไล่ให้ครบทุกหน้า ไม่ใช่ดูหน้าแรกแล้วสรุป** — หน้าแรกไม่ใช่ตัวแทนของทั้งกอง
      (บทเรียนซ้ำของวันนี้: ตัวอย่าง 50 ใบผีเป็น Shopify ทั้งหมด แต่ทั้งกองไม่ใช่)
      ⚠️ เพดานหน้า 12 หน้า กันวนไม่รู้จบถ้า ZORT คืนหน้าเดิมซ้ำ — ชนเพดานต้อง**บอก**
         ห้ามเงียบแล้วรายงานเหมือนนับครบ */
  const MAX_PAGES = 12;
  const byHeader = new Map();
  const byType = new Map();
  let total = null, fetched = 0, pages = 0, hitCap = false, sample = null, rowFields = null;

  /* ⚡ **ยิงหน้าที่ 2 เป็นต้นไปพร้อมกัน ห้ามไล่เรียงกัน** (แก้ 7 ก.ย. 2569)
      ของเดิมไล่ทีละหน้า 7 หน้า ⇒ **6.6–17.3 วินาที** แล้วแต่จุดที่ยิง
      ⇒ **ชนเพดานเวลาฟังก์ชันของ Netlify (26 วิ) เป็นครั้งคราวจริง** —
        ฝั่งจอวัดเจอ 502 ตัวเปล่าที่ 40 วิ หนึ่งครั้งจากสี่ครั้ง
      ⚠️ และเอกสารมีแต่จะเพิ่มขึ้นทุกวัน ⇒ ปล่อยไว้ = วันหนึ่งจะ 502 ถาวร
      ⚠️ **อาการตอนชน ไม่ได้บอกว่า "ช้าเกิน"** — ฝั่งจอเห็นเป็น "อ่าน JSON ไม่ออก"
        (ได้ body เปล่ากลับมา) ⇒ ไล่ผิดทางได้ง่ายมาก
      ⇒ หน้าแรกต้องยิงก่อนเพื่ออ่าน `count` · ที่เหลือยิงพร้อมกันทีเดียว
      ⚠️ **ห้ามเอา await กลับมาเรียงกันอีก** */
  const fetchPage = async (page) => {
    const r = await fetch(`${BASE}/Document/GetDocuments?limit=${per}&page=${page}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const raw = await r.text().catch(() => "");
    let data = null;
    try { data = JSON.parse(raw); } catch { /* ไม่ใช่ JSON */ }
    return { data, raw };
  };

  const eat = (list) => {
    if (!rowFields && list[0] && typeof list[0] === "object") rowFields = Object.keys(list[0]).sort();
    if (!sample) sample = list.slice(0, 2).map(({ detail, ...rest }) => rest);
    for (const it of list) {
      fetched += 1;
      const h = String(it?.header ?? "(ไม่มีหัวเรื่อง)");
      const t = String(it?.referencetype ?? "?");
      byHeader.set(h, (byHeader.get(h) ?? 0) + 1);
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
  };

  for (let page = 1; page <= 1; page++) {
    let r;
    try {
      r = await fetch(`${BASE}/Document/GetDocuments?limit=${per}&page=${page}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      return { ok: false, error: `ยิง ZORT ไม่ถึงที่หน้า ${page}: ${e?.message ?? e}`, fetched, pages };
    }
    const raw = await r.text().catch(() => "");
    let data = null;
    try { data = JSON.parse(raw); } catch { /* ไม่ใช่ JSON */ }
    const code = String(data?.res?.resCode ?? data?.resCode ?? data?.rescode ?? "");
    if (code !== "200")
      return { ok: false, resCode: code || null, error: "ZORT ไม่ได้ตอบว่าสำเร็จ", fetched, pages,
               rawHead: data ? null : raw.slice(0, 300) };
    if (total === null && Number.isFinite(Number(data?.count))) total = Number(data.count);
    const list = Array.isArray(data?.list) ? data.list : null;
    /* สามสถานะ: null = ไม่มีช่องรายการ · [] = หมดแล้ว · มีของ = นับต่อ */
    if (list === null) return { ok: false, error: "ZORT ตอบมาแต่ไม่มีช่องรายการ", fetched, pages };
    pages = page;
    if (!list.length) break;
    if (!rowFields && list[0] && typeof list[0] === "object") rowFields = Object.keys(list[0]).sort();
    if (!sample) {
      /* ⚠️ ตัวอย่างส่งกลับแค่ 2 แถว และ **ตัดช่อง detail ทิ้ง** — ในนั้นมีข้อมูลใบเต็ม
          (ชื่อคู่ค้า ยอดเงิน รายการสินค้า) ซึ่งไม่จำเป็นต่อการตัดสินใจว่าดึงอัตโนมัติได้ไหม */
      sample = list.slice(0, 2).map(({ detail, ...rest }) => rest);
    }
    for (const it of list) {
      fetched += 1;
      const h = String(it?.header ?? "(ไม่มีหัวเรื่อง)");
      const t = String(it?.referencetype ?? "?");
      byHeader.set(h, (byHeader.get(h) ?? 0) + 1);
      byType.set(t, (byType.get(t) ?? 0) + 1);
    }
    if (list.length < per) break;
  }

  /* หน้าที่เหลือยิงพร้อมกันทีเดียว — รู้จำนวนหน้าจาก `count` ของหน้าแรกแล้ว */
  if (total !== null && fetched < total) {
    const need = Math.min(MAX_PAGES, Math.ceil(total / per));
    if (need > 1) {
      const rest = await Promise.all(
        Array.from({ length: need - 1 }, (_, i) => fetchPage(i + 2).catch(() => null))
      );
      for (const got of rest) {
        const list = Array.isArray(got?.data?.list) ? got.data.list : null;
        if (!list) continue; // หน้าไหนพลาด = ไม่นับ · `complete` ด้านล่างจะฟ้องเองว่าไม่ครบ
        pages += 1;
        eat(list);
      }
      if (need >= MAX_PAGES && fetched < total) hitCap = true;
    }
  }

  const sortDesc = (m) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ ชนิด: k, จำนวน: n }));
  return {
    ok: true,
    total,                       // จำนวนที่ ZORT บอก
    fetched,                     // ที่นับได้จริง
    pages,
    /* 🔴 **ต้องบอกเมื่อนับไม่ครบ** — ตัวเลขที่ดูเหมือนครบแต่ไม่ครบ อันตรายกว่าไม่มีตัวเลข */
    complete: total !== null ? fetched >= total : null,
    hitPageCap: hitCap,
    byHeader: sortDesc(byHeader),
    byType: sortDesc(byType),
    rowFields,
    sample,
    /* 🔴 **ข้อความนี้เคยเขียนว่า "ดึงอัตโนมัติได้ ไม่ต้องคัดด้วยมือ" ซึ่งผิด**
        และมันอยู่มาข้ามวันหลังจากผมพิสูจน์แล้วว่าผิด ⇒ ฝั่งจออ่านแล้วเกือบตัด
        เอกสาร 694 ใบออกจากงานที่มีเส้นตายจริง (7 ก.ย. 2569)
        🔑 **ข้อความที่ถูกตอนเขียน แล้วกลายเป็นเท็จ** — และมันอยู่ในฟิลด์ที่คนเอาไปตัดสินใจ
           ⇒ แก้บทเรียนที่หัวไฟล์อื่นอย่างเดียวไม่พอ **ต้องแก้ที่คำตอบซึ่งคนอ่านจริง ๆ ด้วย**
        ⚠️ ห้ามเขียนกลับไปว่าดึงอัตโนมัติได้ จนกว่าจะมีใครโหลด PDF สำเร็จจริงสักใบ */
    note:
      "ได้ **สารบัญ** ครบ · **ไม่ได้ตัวไฟล์** — `linkurl` เปิดไม่ได้ทั้งด้วยรหัส API " +
      "**และด้วยเบราว์เซอร์ที่ล็อกอิน ZORT อยู่จริง** (ทดสอบทั้งสองทางแล้ว 7 ก.ย. 2569: " +
      "ได้ HTML 30KB ไม่ใช่ %PDF ทั้งคู่ · หน้านั้นไม่มีช่องรหัสผ่าน ⇒ **ไม่ใช่หน้าขอล็อกอิน**) " +
      "⚠️ เดิมเขียนไว้ว่า 'ต้องมีคุกกี้เบราว์เซอร์' — นั่นเป็นการ**เดาสาเหตุจากอาการ** และผิด " +
      "ทดสอบแล้วคุกกี้ไม่ได้แก้อะไรเลย ⇒ ยังไม่รู้สาเหตุจริง ห้ามเขียนสาเหตุที่ยังไม่ได้พิสูจน์ " +
      "⇒ **ตัวไฟล์ยังต้องคัดด้วยมือก่อนปิดบัญชี** · ค่าของรายการนี้คือใช้เป็น **ตัวหาร** " +
      "เพื่อเทียบว่าคัดครบ 694 ใบหรือยัง ไม่ใช่เพื่อข้ามงานคัด",
  };
}

/** อ่านค่า webhook ปัจจุบันของ ZORT — **อ่านอย่างเดียว ไม่มีคู่สำหรับเขียนในไฟล์นี้โดยตั้งใจ** */
export async function zortWebhookRead() {
  const headers = creds();
  if (!headers) return { ok: false, error: "ยังไม่ได้ตั้งรหัส ZORT ที่ Netlify" };
  let r;
  try {
    r = await fetch(`${BASE}/Webhook/GetWebhook`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return { ok: false, error: `ยิง ZORT ไม่ถึง: ${e?.message ?? e}` };
  }
  const raw = await r.text().catch(() => "");
  let data = null;
  try { data = JSON.parse(raw); } catch { /* ไม่ใช่ JSON — คืนดิบให้คนอ่านเอง */ }
  /* ⚠️ ZORT ตอบ 200 เสมอ ⇒ ห้ามตัดสินจาก r.ok · และ `resCode` วางไว้คนละที่แล้วแต่โมดูล */
  const resCode = String(data?.res?.resCode ?? data?.resCode ?? data?.rescode ?? "");
  return {
    ok: resCode === "200",
    resCode: resCode || null,
    /* ส่งชื่อช่องที่ได้จริงกลับไปด้วย — ยังไม่มีใครรู้ว่ารูปคำตอบหน้าตายังไง
       เดารูปแล้วอ่านผิด จะกลายเป็น "ไม่มี webhook ตั้งไว้" ซึ่งชวนให้ไปตั้งทับของเดิม */
    fields: data && typeof data === "object" ? Object.keys(data).sort() : null,
    data: data ?? null,
    rawHead: data ? null : raw.slice(0, 400),
  };
}
