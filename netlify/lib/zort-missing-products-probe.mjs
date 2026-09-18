/* 🔎 ZORT มีทางให้ดึง "สินค้าที่ไม่มีรหัส" ออกมาไหม — **อ่านอย่างเดียว**
 *
 * 🟢 **คำถามเดิมของไฟล์นี้ถูกตอบไปแล้ว 18 ก.ย. 2569 — และคำตอบไม่ใช่สิ่งที่ผมเดาไว้**
 *    เดิมเขียนไว้ว่า "API ซ่อนสินค้า 226 รายการ" และสงสัยว่า ZORT หน่วงของใหม่
 *    **ทั้งสองข้อผิด** ฝั่งจอกวาดรหัสจากจอ ZORT ครบ 2,900 แถวแล้วพบว่า:
 *      2,900 บนจอ = **2,674 ที่มีรหัส** + **226 ที่ช่องรหัสว่างเปล่า**
 *      และ 2,674 คือเลขเดียวกับที่ GetProducts ไล่จนหมดให้ ⇒ ส่วนต่างอธิบายครบ เศษ 0
 *      ยืนยันอีกทาง: ท่อเราส่ง `noSkuInZort = 226` ออกมาเองอยู่แล้ว (สองแหล่งที่ไม่เกี่ยวกัน เลขตรงกัน)
 *    ⇒ **ไม่ใช่ของหาย ไม่ใช่ ZORT ซ่อน** — เป็นสินค้าที่ร้านไม่ได้กรอกรหัส
 *      และกระจกเก็บไม่ได้เพราะใช้ "รหัส" เป็นกุญแจ (`sku TEXT PRIMARY KEY`)
 *
 * 🟢 **ส่วนเรื่องสินค้าใหม่ไม่ขึ้นจอ ก็ไม่ใช่เรื่องของ ZORT เช่นกัน**
 *    พิสูจน์แล้ว: ค้น TEST-20260918 ได้ 0 แถว → สั่ง `?snapshot=1` → **เจอทันที** และกระจกขยับ 2,673 → 2,674
 *    เพราะ `list=stock` อ่านจาก **stock_snapshots (ภาพถ่ายสต็อกรายวัน)** ไม่ใช่ตาราง `products`
 *    ภาพถ่ายของวันถูกถ่ายก่อนสินค้าถูกสร้าง ⇒ ของใหม่จึงยังไม่อยู่ในภาพนั้น
 *    🔑 บทเรียนที่แพงที่สุดของรอบนี้: **ผมสรุปสาเหตุออกไปนอกบ้านสองรอบ ก่อนตรวจในบ้านตัวเอง**
 *       ฝั่งจอเป็นคนทักว่า "เลข 2,674 อาจแปลว่า API ส่งมาแล้ว ไม่ใช่ค้างที่เลขเดิม" จึงไล่เจอ
 *
 * ⚙️ **แล้วทำไมยังเก็บไฟล์นี้ไว้**: คำถามที่ยังไม่มีคำตอบคือ
 *    ถ้าท่านประธานสั่งให้กระจกเก็บสินค้า 226 ตัวที่ไม่มีรหัสด้วย เราจะดึงมันออกมาจาก ZORT ได้ทางไหน
 *    GetProducts ไล่หน้าจนหมดยังไงก็ได้แค่ 2,674 ⇒ ต้องรู้ว่ามีพารามิเตอร์อื่นไหม
 *    (และถ้าไม่มี ต้องเปลี่ยนกุญแจกระจกจากรหัสเป็น id ของ ZORT ซึ่งเป็นงานใหญ่กว่ามาก)
 *
 * วิธีตัดสิน: เทียบ `count` กับ **ฐานเปล่าของรอบนั้น** และกับ **เลขบนจอ** (ส่งมาทาง ?screen=)
 *   ได้ ≈2,900 ⇒ เจอทางดึงของที่ไม่มีรหัส · เท่าฐาน ⇒ ถูกเมิน · เลขอื่น ⇒ **ยังตัดสินไม่ได้**
 *   ⚠️ 14,084 คือ "รวมของที่ถูกลบ" ซึ่งเพิ่มขึ้นจริงแต่ **ไม่ใช่คำตอบของ 226** — เทสบังคับข้อนี้ไว้
 * ⚠️ มีตัวควบคุมชื่อที่ไม่มีอยู่จริงในชุดเดียวกัน · GET · limit=1 (สนใจแค่ count)
 */

const BASE = "https://open-api.zortout.com/v4";

/* เลขอ้างอิงที่วัดไว้ — เขียนวันที่กำกับเพราะมันจะเก่าเมื่อร้านเพิ่มสินค้า
   ⚠️ ห้ามเอาไปใช้เป็นเกณฑ์ตายตัวในโค้ดอื่น ใช้แค่ในคำอธิบายผลของ probe นี้ */
const SCREEN_TOTAL_AT_MEASURE = 2900;   // จอ ZORT · 18 ก.ย. 2569 12:1x
const API_TOTAL_AT_MEASURE = 2674;      // open-api ไล่หน้าจนหมด · เวลาเดียวกัน

/* พารามิเตอร์ที่จะลอง — ชื่อที่ฝั่งจอดักจากคำขอจริงของจอสินค้า ZORT มาก่อน
   (doAdvanceSearchProduct ส่ง: code name fromsellprice tosellprice frompurchaseprice topurchaseprice
    categoryname warehouseid tagsearch wid cid sohs pagestatus showarchive OnlyOutOfStock
    producttype producttypelist csid warehouseId) */
const CANDIDATES = [
  ["ฐานเปล่า (ตัวเทียบ)", ""],
  /* ① กลุ่ม "ขอของที่ถูกลบด้วย" — ถ้าเลขพุ่งไปไกลกว่า 2,900 มาก แปลว่ารวม archive (ไม่ใช่คำตอบของ 226) */
  ["showarchive=1", "&showarchive=1"],
  /* ② กลุ่ม "สถานะหน้า/สถานะสินค้า" — จอเขาส่ง pagestatus มาด้วยทุกครั้ง */
  ["pagestatus=all", "&pagestatus=all"],
  ["pagestatus=0", "&pagestatus=0"],
  ["status=all", "&status=all"],
  /* ③ กลุ่ม "เปิด/ปิดใช้งาน" — สินค้าที่ปิดใช้งานอาจไม่อยู่ในรายการโดยปริยาย */
  ["active=all", "&active=all"],
  ["isactive=0", "&isactive=0"],
  ["showinactive=1", "&showinactive=1"],
  /* ④ กลุ่ม "ชนิดสินค้า" — สินค้าชุด/บริการอาจถูกแยกกอง (กระจกมี bundle 360 คนละกอง) */
  ["producttype=all", "&producttype=all"],
  ["producttypelist=0,1,2", "&producttypelist=0,1,2"],
  /* ⑤ 🧪 ตัวควบคุม */
  ["🧪 ตัวควบคุม: ชื่อที่ไม่มีอยู่จริง", "&พารามิเตอร์ที่ไม่มีจริง=1"],
];

function headers() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

async function countWith(h, extra) {
  try {
    const r = await fetch(`${BASE}/Product/GetProducts?limit=1&page=1${extra}`,
      { headers: h, signal: AbortSignal.timeout(12000) });
    const b = r.ok ? await r.json().catch(() => null) : null;
    const n = Number(b?.count);
    return { status: r.status, count: Number.isFinite(n) ? n : null };
  } catch (e) {
    /* ยิงไม่สำเร็จ ≠ พารามิเตอร์ใช้ไม่ได้ */
    return { status: null, count: null, error: String(e?.message || e).slice(0, 100) };
  }
}

/** ตัดสินผลหนึ่งพารามิเตอร์ — ต้องแยก "ปลดล็อกได้" / "ถูกเมิน" / "ตัดสินไม่ได้" ออกจากกัน
 * @param {number|null} count ผลที่ได้
 * @param {number|null} baseline ฐานเปล่าของรอบนี้ (ไม่ใช่เลขที่ฝังไว้)
 * @param {number|null} screen เลขบนจอ ZORT ที่คนไปอ่านมาให้ (ไม่มี ⇒ ใช้เลขที่วัดไว้)
 */
export function judgeMissing(count, baseline, screen = SCREEN_TOTAL_AT_MEASURE) {
  if (count === null) return "อ่าน count ไม่ได้ ⇒ ตัดสินไม่ได้";
  if (baseline !== null && count === baseline) return "❌ ถูกเมิน (count เท่าฐานเปล่า)";
  if (screen && Math.abs(count - screen) <= 2)
    return `✅ ปลดล็อกได้ — ได้ ${count} ตรงกับเลขบนจอ (${screen})`;
  if (baseline !== null && count > baseline)
    return `⚠️ count เพิ่มเป็น ${count} (ฐาน ${baseline}) แต่ไม่ตรงเลขบนจอ ⇒ ยังตัดสินไม่ได้ ต้องดูว่าของที่เพิ่มมาคืออะไร`;
  return `⚠️ count ลดเป็น ${count} ⇒ พารามิเตอร์นี้กรองของออก ไม่ใช่ปลดล็อก`;
}

export async function zortMissingProductsProbe(screenTotal) {
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };
  const screen = Number.parseInt(String(screenTotal ?? ""), 10);
  const screenUse = Number.isFinite(screen) && screen > 0 ? screen : SCREEN_TOTAL_AT_MEASURE;

  const base = await countWith(h, "");
  const baseline = base.count;
  const rows = [];
  for (const [name, extra] of CANDIDATES) {
    const r = await countWith(h, extra);
    rows.push({
      พารามิเตอร์: name, status: r.status, count: r.count, error: r.error ?? null,
      ผล: name.startsWith("ฐานเปล่า") ? `ฐาน = ${r.count}` : judgeMissing(r.count, baseline, screenUse),
    });
  }
  const ctrl = rows.find((x) => x.พารามิเตอร์.startsWith("🧪"));
  const ctrlStable = ctrl ? ctrl.count === baseline : null;
  const unlocked = rows.filter((x) => x.ผล.startsWith("✅")).map((x) => x.พารามิเตอร์);

  return {
    ok: true,
    ถามอะไร: "มีพารามิเตอร์ให้ดึง 'สินค้าที่ไม่มีรหัส' (226 ตัว) ออกมาจาก GetProducts ไหม",
    "รู้แล้วว่า": "2,900 บนจอ = 2,674 ที่มีรหัส + 226 ที่ช่องรหัสว่าง (ฝั่งจอกวาดจากจอ ZORT ยืนยัน · ท่อส่ง noSkuInZort=226 ตรงกัน) ⇒ ไม่ใช่ของหาย",
    ฐานเปล่ารอบนี้: baseline,
    เลขบนจอที่ใช้เทียบ: screenUse,
    ต่างกัน: baseline === null ? null : screenUse - baseline,
    "⚠️ เลขบนจอมาจากไหน": "คนไปอ่านจากจอ ZORT (ส่งมาทาง ?screen=) ไม่ใช่ค่าที่ท่อวัดเองได้ ⇒ เก่าได้",
    ผลลอง: rows,
    ตัวควบคุมนิ่ง: ctrlStable,
    ...(ctrlStable === false
      ? { "🔴 เตือน": "ตัวควบคุมทำให้ count เปลี่ยน ⇒ เลขนี้แกว่งเอง · ผลชุดนี้ใช้ตัดสินไม่ได้" }
      : {}),
    สรุป: ctrlStable === false ? "ใช้ตัดสินไม่ได้ — ดูคำเตือน"
      : unlocked.length ? `พารามิเตอร์ที่ดึงสินค้าไม่มีรหัสออกมาได้: ${unlocked.join(" · ")}`
      : "ยังไม่เจอพารามิเตอร์ที่ดึงสินค้าไม่มีรหัสออกมาได้ในชุดนี้ ⇒ **ยังไม่ปิดประตู** " +
        "ถ้า ZORT ไม่มีทางส่งมาเลย ทางเดียวคือเปลี่ยนกุญแจกระจกจากรหัสเป็น id ของ ZORT " +
        "ซึ่งเป็นงานใหญ่และต้องให้ท่านประธานตัดสินก่อน ไม่ใช่งานที่เริ่มเองได้",
  };
}
