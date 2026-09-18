/* 🔎 ทำไม "รายการรวม" ของ ZORT ส่งสินค้ามาไม่ครบ — **อ่านอย่างเดียว**
 *
 * ของจริงที่วัดได้ 18 ก.ย. 2569 (สี่ทาง วัดในนาทีเดียวกัน):
 *   · จอสินค้า ZORT บอก **2,900 รายการ** (ช่อง "แสดงสินค้าที่ถูกลบ" **ไม่ได้ติ๊ก**)
 *   · open-api `Product/GetProducts` ไล่หน้าจนหมด ส่งมา **2,674 รายการ**
 *   · กระจกเรามี **2,673 แถว**
 *   ⇒ หายไป **226 รายการ** และ **ไม่ใช่เพราะเป็นของที่ถูกลบ** (ช่องนั้นไม่ได้ติ๊ก)
 *
 * เจอเพราะ: สร้างสินค้าทดสอบจริง (TEST-20260918 เวลา 11:50:41 ไทย) แล้ว
 *   · จอ ZORT เห็นทันที และนับรวมเป็น 2,900
 *   · แต่ API ไม่ส่งมาเลย แม้ผ่าน 26 นาที (ซิงก์ 4 รอบ ได้ 2,674 เท่าเดิมทุกรอบ)
 *   ⇒ **สมมติฐาน "ZORT ใช้เวลา index" ตกไปแล้ว** — ไม่ใช่ความล่าช้า แต่เป็นเงื่อนไขอะไรอย่างหนึ่ง
 *
 * 🔑 **ยังไม่รู้ว่าเงื่อนไขคืออะไร — ไฟล์นี้มีไว้ถาม ไม่ใช่มีไว้ยืนยันสิ่งที่เดาไว้**
 *    ข้อต่างที่เห็นด้วยตาระหว่างตัวทดสอบกับสินค้าปกติ: ตัวทดสอบ **ไม่มีหมวดหมู่**
 *    แต่ "เห็นสองอย่างพร้อมกัน" ไม่ใช่ "อย่างหนึ่งทำให้อีกอย่างเกิด"
 *    ⇒ ต้องวัดว่าเปลี่ยนพารามิเตอร์แล้ว count ขยับไปทางที่คาดไหม
 *
 * วิธีตัดสิน: เทียบ `count` ของแต่ละคำขอกับ **ฐานเปล่า (2,674)** และกับ **เลขบนจอ (2,900)**
 *   · ได้ ≈2,900 ⇒ เจอพารามิเตอร์ที่ปลดล็อกของที่ขาด
 *   · ได้เท่าฐาน ⇒ พารามิเตอร์นั้นถูกเมิน
 *   · ได้เลขอื่น ⇒ **ยังตัดสินไม่ได้** ต้องดูของจริง ห้ามนับเป็นคำตอบ
 * ⚠️ มีตัวควบคุมชื่อที่ไม่มีอยู่จริงในชุดเดียวกัน — ถ้ามันทำให้ count เปลี่ยน ผลทั้งชุดใช้ไม่ได้
 * ⚠️ GET · limit=1 (สนใจแค่ count) ⇒ ไม่ดึงข้อมูลออกมา
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
    ถามอะไร: "ทำไม Product/GetProducts ส่งสินค้ามาน้อยกว่าที่จอ ZORT บอก",
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
      : unlocked.length ? `พารามิเตอร์ที่ปลดล็อกของที่ขาดได้: ${unlocked.join(" · ")}`
      : "ยังไม่เจอพารามิเตอร์ที่ปลดล็อกในชุดนี้ ⇒ **ยังไม่ปิดประตู** " +
        "ทางถัดไปคือเทียบรายชื่อรหัสจากจอ ZORT กับกระจก แล้วดูว่า 226 รหัสที่ขาดมีอะไรเหมือนกัน " +
        "(ห้ามสรุปจากข้อต่างที่เห็นด้วยตาเพียงข้อเดียว — ตัวทดสอบไม่มีหมวดหมู่ แต่นั่นยังไม่ใช่หลักฐานว่าเป็นเพราะหมวดหมู่)",
  };
}
