/* 🔎 ยิงถาม ZORT ว่า "ขอของที่ถูกลบ (archive) ได้ไหม" — **อ่านอย่างเดียว ไม่เขียนอะไรทั้งนั้น**
   ใบงาน: ฝั่งจอขอเป็นลำดับแรกทั้งจอสินค้าและจอผู้ติดต่อ (18 ก.ย. 2569)
   · จอสินค้า: ของที่ถูกลบมี ~11,185 รายการ (ปกติ 2,899 · ติ๊กแล้ว 14,084)
   · จอผู้ติดต่อ: ถูกลบ 3,170 ราย (ปกติ 28,344 · ติ๊กแล้ว 31,514)
   · ZORT ใช้ช่องติ๊กชื่อเดียวกันทั้งสองจอ: `checkshowarchive` (ฝั่งจออ่าน id มาจาก DOM)

   🔑 **ตัวชี้ขาดคือ "count เปลี่ยนไหม" ไม่ใช่ "ตอบ 200 ไหม"**
      ZORT เมินพารามิเตอร์ที่ไม่รู้จักแล้วตอบ 200 พร้อมข้อมูลชุดเดิม — เจอมาแล้วหลายรอบ
      ⇒ ต้องเทียบกับ **ฐานเปล่า** และต้องมี **ตัวควบคุมชื่อมั่ว** ด้วย
      ถ้าตัวควบคุมทำให้ count เปลี่ยน แปลว่าเลขนั้นแกว่งเอง ⇒ ผลทั้งชุดใช้ตัดสินไม่ได้
   ⚠️ ห้ามสรุปจากชื่อพารามิเตอร์ที่ "ฟังดูน่าจะใช่" — ต้องมีเลขยืนยัน
   ⚠️ ทุกคำขอเป็น GET ขอหน้าเล็กสุด (limit=1) ⇒ ไม่กินโควตาและไม่แตะข้อมูลจริง */

const BASE = "https://open-api.zortout.com/v4";

function headers() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

/* ชื่อที่จะลอง — เรียงจาก "ที่จอเขาใช้จริง" ไปหา "ที่พบบ่อยใน API แนวนี้"
   ⚠️ ตัวควบคุมต้องอยู่ในชุดเดียวกันและยิงด้วยวิธีเดียวกัน ไม่ใช่ยิงแยกทีหลัง */
const CANDIDATES = [
  ["ฐานเปล่า (ตัวเทียบ)", ""],
  ["checkshowarchive=true", "&checkshowarchive=true"],
  ["checkshowarchive=1", "&checkshowarchive=1"],
  ["showarchive=true", "&showarchive=true"],
  ["showarchived=true", "&showarchived=true"],
  ["includearchive=true", "&includearchive=true"],
  ["includedeleted=true", "&includedeleted=true"],
  ["isdeleted=true", "&isdeleted=true"],
  ["archive=1", "&archive=1"],
  ["status=all", "&status=all"],
  ["active=0", "&active=0"],
  ["🧪 ตัวควบคุม: ชื่อที่ไม่มีอยู่จริง", "&ไม่มีพารามิเตอร์นี้จริง=1"],
];

const ENDPOINTS = [
  ["สินค้า", `${BASE}/Product/GetProducts?limit=1&page=1`],
  ["ผู้ติดต่อ", `${BASE}/Contact/GetContacts?limit=1&page=1`],
];

export async function zortArchivedProbe() {
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };
  const out = [];
  for (const [what, base] of ENDPOINTS) {
    const rows = [];
    let baseline = null;
    for (const [name, extra] of CANDIDATES) {
      let count = null, http = 0, err = null;
      try {
        const r = await fetch(base + extra, { headers: h, signal: AbortSignal.timeout(10000) });
        http = r.status;
        const j = await r.json().catch(() => null);
        /* ⚠️ count เป็นตัวเดียวที่บอกขอบเขตทั้งกอง — list มีแค่ 1 แถวเพราะเราขอ limit=1 */
        count = Number.isFinite(Number(j?.count)) ? Number(j.count) : null;
      } catch (e) {
        err = String(e?.message ?? e).slice(0, 80);
      }
      if (baseline === null && count !== null) baseline = count;
      rows.push({
        ลอง: name, http, count,
        ต่างจากฐาน: count === null || baseline === null ? null : count - baseline,
        error: err,
      });
    }
    const ctrl = rows.find((r) => r.ลอง.startsWith("🧪"));
    const ได้ผล = rows.filter((r) => !r.ลอง.startsWith("🧪") && r.ต่างจากฐาน && r.ต่างจากฐาน > 0);
    out.push({
      what, baseline, rows,
      /* 🔴 ตัวควบคุมต้องได้ผลเท่าฐาน ไม่งั้นผลทั้งชุดใช้ตัดสินไม่ได้ */
      ตัวควบคุมนิ่ง: ctrl ? ctrl.ต่างจากฐาน === 0 : null,
      พารามิเตอร์ที่ทำให้เลขเพิ่ม: ได้ผล.map((r) => r.ลอง),
      สรุป: !ctrl || ctrl.ต่างจากฐาน !== 0
        ? "⚠️ ตัวควบคุมไม่นิ่ง ⇒ เลข count แกว่งเอง ผลชุดนี้ใช้ตัดสินไม่ได้"
        : ได้ผล.length
          ? "✅ มีพารามิเตอร์ที่ทำให้ได้ของที่ถูกลบมาด้วย ⇒ ทำตัวกรอง archived ได้"
          : "❌ ไม่มีชื่อไหนทำให้เลขเพิ่ม ⇒ open-api v4 อาจไม่เปิดให้ขอของที่ถูกลบ (ยังไม่ปิดประตู: อาจใช้ชื่ออื่นที่ยังไม่ได้ลอง)",
    });
  }
  return {
    ok: true,
    note: "อ่านอย่างเดียว · ตัวชี้ขาดคือ count เทียบกับฐานเปล่า ไม่ใช่ HTTP 200 · " +
      "มีตัวควบคุมชื่อมั่วในชุดเดียวกัน ถ้าตัวควบคุมทำให้เลขเปลี่ยน = ผลใช้ไม่ได้",
    results: out,
  };
}
