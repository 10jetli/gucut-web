/* 🔎 ZORT ยอมให้ "กรองเอกสารด้วยช่วงวัน / คำค้น" ที่ต้นทางไหม — **อ่านอย่างเดียว**
 *
 * ทำไมต้องรู้ (ฝั่งจอรายงาน 18 ก.ย. 2569):
 *   จอเอกสารบัญชีของ ZORT มีช่อง ค้นหา · ตั้งแต่วันที่ · ถึงวันที่ แต่ท่อเรารับแค่ page/limit/type
 *   ⇒ ฝั่งจอต้อง **โหลดครบทุกหน้าก่อนแล้วค่อยกรองในเบราว์เซอร์** (694 ใบ = 4 คำขอทุกครั้งที่กรอง)
 *   เขาเลือกทางนั้นถูกแล้ว เพราะกรองเฉพาะหน้าที่เปิดอยู่ = กรอง 50 จาก 694 ซึ่งเป็นปุ่มหลอก
 *   แต่วิธีนั้นจะแพงขึ้นเรื่อย ๆ ตามจำนวนเอกสาร ⇒ ถ้าต้นทางกรองได้ ควรย้ายไปกรองที่ต้นทาง
 *
 * 🔑 **ตัวชี้ขาดที่แข็งที่สุดของไฟล์นี้: ใช้คำตอบที่รู้จากการวัดคนละครั้ง**
 *    วัดไว้ก่อนหน้า (คนละวัน คนละวิธี): เอกสารทั้งกอง 694 ใบ = ปี 2565 จำนวน 689 + ปี 2567 สามใบ + ปี 2568 สองใบ
 *    ⇒ ขอช่วงปี 2024 (พ.ศ. 2567) **ต้องได้ 3** ถ้าพารามิเตอร์มีผลจริง
 *      ได้ 694 เท่าเดิม = ถูกเมินเงียบ ๆ (ZORT ตอบ 200 ให้พารามิเตอร์ที่ไม่รู้จัก)
 *      ได้เลขอื่นที่ไม่ใช่ทั้งสองอย่าง = **ยังตัดสินไม่ได้** ต้องมาดูด้วยตา ห้ามเดาว่าใช้ได้
 *    นี่คือการตรวจที่ผลไปตรงกับของที่วัดไว้คนละครั้ง ไม่ใช่ถามตัวเองด้วยสมมติฐานตัวเอง
 *    (กฎ tautology-checks-are-always-green · test-must-discriminate)
 *
 * ⚠️ GET เท่านั้น · limit=1 (เราสนใจ `count` ไม่ใช่แถว) ⇒ ไม่ดึงข้อมูลลูกค้าออกมาเลย
 * ⚠️ มีตัวควบคุมชื่อที่ไม่มีอยู่จริงในชุดเดียวกัน — ถ้าตัวควบคุมทำให้ count เปลี่ยน
 *    แปลว่า count แกว่งเอง ⇒ ผลทั้งชุดใช้ตัดสินไม่ได้
 */

const BASE = "https://open-api.zortout.com/v4";

/* ปีที่ใช้เป็นตัวชี้ขาด + จำนวนที่วัดไว้ล่วงหน้า (ค.ศ. เพราะ ZORT ใช้ ค.ศ. ในช่องวันที่) */
const PROBE_YEAR = 2024;
const EXPECTED_IN_YEAR = 3;     // ปี พ.ศ. 2567 = 3 ใบ (วัดไว้คนละครั้ง)

/* ชื่อพารามิเตอร์ช่วงวันที่ที่จะลอง — รูปที่ ZORT ใช้จริงในโมดูลอื่นมาก่อน
   (Order/GetOrders ใช้ orderdateafter / orderdatebefore ⇒ เอกสารน่าจะ documentdate*) */
const DATE_CANDIDATES = [
  ["documentdateafter/before", `&documentdateafter=${PROBE_YEAR}-01-01&documentdatebefore=${PROBE_YEAR}-12-31`],
  ["documentdatefrom/to", `&documentdatefrom=${PROBE_YEAR}-01-01&documentdateto=${PROBE_YEAR}-12-31`],
  ["datefrom/dateto", `&datefrom=${PROBE_YEAR}-01-01&dateto=${PROBE_YEAR}-12-31`],
  ["createdatetimeafter/before", `&createdatetimeafter=${PROBE_YEAR}-01-01&createdatetimebefore=${PROBE_YEAR}-12-31`],
  /* ⬇️ ชื่อที่ฝั่งจอดักจากคำขอจริงของจอเอกสาร ZORT (18 ก.ย. 2569)
     เส้นเขาคือ POST ZDocument/doAdvanceSearchDocumentHistory ส่ง fromdate/todate
     🔑 **และรูปแบบวันของเขาเป็น วัน/เดือน/ปี พ.ศ.** ไม่ใช่ ISO ค.ศ.
        ⇒ ต้องลองทั้งสองรูป ไม่งั้นชื่อถูกแต่รูปแบบผิด แล้วเราจะสรุปว่า 'ZORT ไม่รองรับ'
        (โรคเดียวกับ ui-label-is-not-the-param-name แต่คนละชั้น: ชั้นนี้คือ **ค่า** ไม่ใช่ชื่อ) */
  ["fromdate/todate (ISO ค.ศ.)", `&fromdate=${PROBE_YEAR}-01-01&todate=${PROBE_YEAR}-12-31`],
  ["fromdate/todate (วัน/เดือน/ปี พ.ศ. — รูปที่จอเขาส่งจริง)",
    `&fromdate=01/01/${PROBE_YEAR + 543}&todate=31/12/${PROBE_YEAR + 543}`],
  /* 🧪 ตัวควบคุม: ชื่อที่ไม่มีอยู่จริง ต้องได้ count เท่าฐาน */
  ["🧪 ตัวควบคุม: ชื่อช่วงวันที่ที่ไม่มีจริง", `&ช่วงวันที่ไม่มีจริง=${PROBE_YEAR}`],
];

/* ชื่อพารามิเตอร์คำค้นที่จะลอง — ตัดสินด้วย "count ลดลงจากฐาน" เท่านั้น
   ⚠️ ไม่ยืนยันว่ากรองถูกฟิลด์ไหน (อาจค้นเฉพาะเลขที่เอกสาร ไม่ค้นหัวเรื่อง)
      ⇒ ถ้าเจอว่ามีผล ต้องตามไปดูของจริงก่อนเอาไปต่อจอ */
const SEARCH_CANDIDATES = [
  ["search", "&search=ใบส่งสินค้า"],
  ["keyword", "&keyword=ใบส่งสินค้า"],
  ["q", "&q=ใบส่งสินค้า"],
  ["documentnumber", "&documentnumber=ใบส่งสินค้า"],
  ["header", "&header=ใบส่งสินค้า"],
];

/* 📄 ชนิดเอกสารแบบ "ข้อความ" — ช่องที่จอเขาใช้ชื่อ doctypetext
   🔑 ทำไมสำคัญกว่าตัวอื่น: documenttype 1–5 ครอบแค่ 63 ใบจาก 694
      อีก 631 ใบเป็น "ใบส่งสินค้า" ที่ **ไม่มีเลขชนิด** ⇒ ตัวกรองชนิดของเราแตะไม่ถึงเลย
      ถ้ากรองด้วยข้อความได้ ปัญหาที่ค้างมานานจบ
   ⚠️ เกณฑ์ของกลุ่มนี้ต่างจากกลุ่มช่วงวันที่ — คำตอบที่รู้ล่วงหน้าคือ **ราว 630 ใบ**
      (ฝั่งจอค้นคำนี้จากทั้ง 694 ใบที่โหลดครบ ได้ 630) ไม่ใช่ 3 ใบแบบกลุ่มปี
      เอาไปปนกลุ่มเดียวกันเมื่อไหร่ ผลที่ถูกจะถูกตีว่า "ตัดสินไม่ได้" */
const DOCTYPE_EXPECTED = 630;
const DOCTYPE_TOLERANCE = 5;      // เผื่อเอกสารเพิ่มระหว่างวัน · ไม่ใช่เผื่อให้ผลผ่านง่าย
const DOCTYPE_CANDIDATES = [
  ["doctypetext (ชื่อที่จอเขาส่งจริง)", "&doctypetext=ใบส่งสินค้า"],
  ["documenttypetext", "&documenttypetext=ใบส่งสินค้า"],
  ["doctype", "&doctype=ใบส่งสินค้า"],
];

export function judgeDoctypeResult(count, baseline) {
  if (count === null) return "อ่าน count ไม่ได้ ⇒ ตัดสินไม่ได้";
  if (baseline !== null && count === baseline) return "❌ เมินเงียบ ๆ (count เท่าฐาน)";
  if (Math.abs(count - DOCTYPE_EXPECTED) <= DOCTYPE_TOLERANCE)
    return `✅ ใช้ได้ — ได้ ${count} ใกล้ ${DOCTYPE_EXPECTED} ที่ฝั่งจอวัดไว้คนละครั้ง`;
  return `⚠️ count เปลี่ยนเป็น ${count} แต่ห่างจาก ${DOCTYPE_EXPECTED} ที่วัดไว้ ⇒ ยังตัดสินไม่ได้ ต้องดูของจริง`;
}

function headers() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

async function countWith(h, extra) {
  try {
    const r = await fetch(`${BASE}/Document/GetDocuments?page=1&limit=1${extra}`,
      { headers: h, signal: AbortSignal.timeout(12000) });
    const b = r.ok ? await r.json().catch(() => null) : null;
    const n = Number(b?.count);
    return { status: r.status, count: Number.isFinite(n) ? n : null };
  } catch (e) {
    /* ยิงไม่สำเร็จ ≠ พารามิเตอร์ใช้ไม่ได้ — ต้องแยกให้คนอ่านเห็น */
    return { status: null, count: null, error: String(e?.message || e).slice(0, 100) };
  }
}

/** ตัดสินผลของ "ช่วงวันที่" — ต้องเทียบกับทั้งฐานและคำตอบที่รู้ล่วงหน้า */
export function judgeDateResult(count, baseline) {
  if (count === null) return "อ่าน count ไม่ได้ ⇒ ตัดสินไม่ได้";
  if (baseline !== null && count === baseline) return "❌ เมินเงียบ ๆ (count เท่าฐาน)";
  if (count === EXPECTED_IN_YEAR) return `✅ ใช้ได้ — ได้ ${EXPECTED_IN_YEAR} ตรงกับที่วัดไว้คนละครั้ง`;
  return `⚠️ count เปลี่ยนเป็น ${count} แต่ไม่ตรงกับ ${EXPECTED_IN_YEAR} ที่วัดไว้ ⇒ ยังตัดสินไม่ได้ ต้องดูของจริง`;
}

export async function zortDocFilterProbe() {
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };

  const base = await countWith(h, "");
  const baseline = base.count;

  const dates = [];
  for (const [name, extra] of DATE_CANDIDATES) {
    const r = await countWith(h, extra);
    dates.push({
      พารามิเตอร์: name, status: r.status, count: r.count, error: r.error ?? null,
      ผล: judgeDateResult(r.count, baseline),
    });
  }
  const searches = [];
  for (const [name, extra] of SEARCH_CANDIDATES) {
    const r = await countWith(h, extra);
    searches.push({
      พารามิเตอร์: name, status: r.status, count: r.count, error: r.error ?? null,
      ผล: r.count === null ? "อ่าน count ไม่ได้ ⇒ ตัดสินไม่ได้"
        : baseline !== null && r.count === baseline ? "❌ เมินเงียบ ๆ (count เท่าฐาน)"
        : `⚠️ count เปลี่ยนเป็น ${r.count} — มีผลบางอย่าง แต่ **ยังไม่รู้ว่ากรองฟิลด์ไหน** ต้องดูของจริงก่อนต่อจอ`,
    });
  }

  const doctypes = [];
  for (const [name, extra] of DOCTYPE_CANDIDATES) {
    const r = await countWith(h, extra);
    doctypes.push({
      พารามิเตอร์: name, status: r.status, count: r.count, error: r.error ?? null,
      ผล: judgeDoctypeResult(r.count, baseline),
    });
  }

  const ctrl = dates.find((d) => d.พารามิเตอร์.startsWith("🧪"));
  const ctrlStable = ctrl ? ctrl.count === baseline : null;
  const ใช้ได้ = dates.filter((d) => !d.พารามิเตอร์.startsWith("🧪") && d.ผล.startsWith("✅"))
    .map((d) => d.พารามิเตอร์);
  const ชนิดใช้ได้ = doctypes.filter((d) => d.ผล.startsWith("✅")).map((d) => d.พารามิเตอร์);

  return {
    ok: true,
    ถามอะไร: "Document/GetDocuments รับตัวกรองช่วงวันที่/คำค้นที่ต้นทางไหม",
    ฐานเปล่า: baseline,
    คำตอบที่รู้ล่วงหน้า: `ปี ${PROBE_YEAR} (พ.ศ. ${PROBE_YEAR + 543}) ต้องได้ ${EXPECTED_IN_YEAR} ใบ — วัดไว้คนละครั้ง คนละวิธี`,
    ช่วงวันที่: dates,
    ชนิดเอกสารแบบข้อความ: doctypes,
    คำค้น: searches,
    ตัวควบคุมนิ่ง: ctrlStable,
    ...(ctrlStable === false
      ? { "🔴 เตือน": "ตัวควบคุม (ชื่อที่ไม่มีจริง) ทำให้ count เปลี่ยน ⇒ count แกว่งเอง · ผลชุดนี้ใช้ตัดสินไม่ได้" }
      : {}),
    สรุป: ctrlStable === false
      ? "ใช้ตัดสินไม่ได้ — ดูคำเตือน"
      : ใช้ได้.length
        ? `กรองช่วงวันที่ได้ด้วย: ${ใช้ได้.join(" · ")}${ชนิดใช้ได้.length ? ` · กรองชนิดแบบข้อความได้ด้วย: ${ชนิดใช้ได้.join(" · ")}` : ""} ⇒ ย้ายการกรองไปต้นทางได้ จอเลิกโหลดครบทุกหน้า`
        : ชนิดใช้ได้.length
        ? `ช่วงวันที่ยังไม่เจอ แต่ **กรองชนิดแบบข้อความได้**: ${ชนิดใช้ได้.join(" · ")} ⇒ ใบส่งสินค้า 631 ใบที่ไม่มีเลขชนิด กรองได้แล้ว`
      : "ยังไม่เจอชื่อที่กรองช่วงวันที่ได้ในชุดนี้ ⇒ **ยังไม่ปิดประตู** อาจใช้ชื่ออื่น (ให้ฝั่งจอดักคำขอจากจอ ZORT มาให้เหมือนที่ทำกับ showarchive)",
  };
}
