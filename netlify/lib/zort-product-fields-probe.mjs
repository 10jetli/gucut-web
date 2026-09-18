/* 🔎 ZORT ส่ง "ต้นทุน" อะไรมาให้เราได้บ้าง — **อ่านอย่างเดียว ไม่เขียนอะไรทั้งนั้น**

   คำถามที่ต้องตอบ (ฝั่งจอถามมา 18 ก.ย. 2569 · ใบกำไรจากการขาย):
   ZORT คิดกำไรจาก **ต้นทุนถัวเฉลี่ยเคลื่อนที่** (หลักฐานฝั่งจอ: ทศนิยมไม่กลม เช่น 1466.7813 ·
   กำไรรายวันมากกว่ายอดขาย 12 เท่าในวันที่มีการปรับมูลค่าสต็อก) แต่กระจกเรามีแค่
   `purchaseprice` = ราคาซื้อในทะเบียน ซึ่ง **ไม่ใช่ต้นทุน ณ เวลาที่ขาย**
   ⇒ ถ้า open-api มีช่องต้นทุนถัวเฉลี่ยให้ดึง งานจบในคืนเดียว
     ถ้าไม่มี ต้องซิงก์ประวัติการซื้อทั้งหมดมาคำนวณเอง (งานใหญ่ + อาจติดสิทธิ์แบบ KLD/ANJ)

   🔴 **ทำไมต้องมีเส้นนี้ แทนที่จะดูจากตัวอ่านที่มีอยู่**
      ตัวอ่านทุกตัวของเรา **คัดฟิลด์ก่อนคืน** — `zortFindProduct` คืนแค่ 10 ช่องที่เราเลือกไว้เอง
      ยิงดูแล้วไม่เห็นช่องต้นทุน **ไม่ได้แปลว่า ZORT ไม่ส่งมา** แปลว่าตัวอ่านของเราไม่เอามา
      (กฎ probe-shares-the-bug: ตัวตรวจที่ใช้สมมติฐานร่วมกับตัวที่ถูกตรวจ = ถามซ้ำ ไม่ใช่ทดสอบ)
      ⇒ เส้นนี้จึงคืน **ชื่อช่องดิบทั้งหมด** ที่ ZORT ส่งมา ไม่ผ่านตัวคัดใด ๆ

   🔑 บทเรียนที่ยืมมาใช้: `GetBundleDetail?id=` ให้ "สูตรชุด" ที่รายการรวมไม่มี
      (บันทึกเก่าเคยเขียนว่าไม่มีเส้นนี้ — ผิด) ⇒ ของสินค้าก็อาจมีเส้นรายละเอียดที่ให้มากกว่า
      จึง **กวาดคู่ (โมดูล × คำกริยา)** ไม่ใช่นึกชื่อทีละตัว (กฎ absence-needs-full-probe)
   ⚠️ GET เท่านั้น — POST ไปเส้น Add หรือ Update ได้ 200 แล้วแยกไม่ออกว่าสร้างเอกสารจริงไปแล้วหรือเปล่า
   ⚠️ คืน **ชื่อช่อง + ชนิด + ตัวอย่างค่าที่เป็นตัวเลขเท่านั้น** ไม่คืนชื่อลูกค้า/ที่อยู่
      (ของสินค้าไม่มี PII แต่ยึดกติกาเดิมไว้ ป้องกันเส้นนี้ถูกนำไปใช้กับโมดูลอื่นแบบลอก ๆ) */

const BASE = "https://open-api.zortout.com/v4";

/* ชื่อที่จะถือว่า "น่าจะเป็นต้นทุน" — ใช้ **ชี้ให้ไปดู** ไม่ใช่ตัดสิน
   ⚠️ ห้ามเอาผลนี้ไปใช้ทันที: ชื่อที่มีคำว่า cost อาจเป็นต้นทุนค่าส่ง ไม่ใช่ต้นทุนสินค้า
      และช่องที่ไม่มีคำพวกนี้อาจเป็นต้นทุนจริง (ZORT ตั้งชื่อไทยคำอังกฤษปนก็มี)
   ⇒ จึงคืน **ชื่อช่องทั้งหมด** ควบคู่ไปด้วยเสมอ */
const COST_HINTS = ["cost", "avg", "average", "moving", "valuation", "value", "purchase", "onhandvalue", "stockvalue"];

function headers() {
  const { ZORT_STORENAME, ZORT_APIKEY, ZORT_APISECRET } = process.env;
  if (!ZORT_STORENAME) return null;
  return { storename: ZORT_STORENAME, apikey: ZORT_APIKEY, apisecret: ZORT_APISECRET };
}

export function shape(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === null || v === undefined) out[k] = "ว่าง";
    else if (typeof v === "number") out[k] = v;                    // ตัวเลขโชว์ได้ ใช้ตัดสินว่าช่องไหนคือต้นทุน
    else if (typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = `(รายการ ${v.length} รายการ)`;
    else if (typeof v === "object") out[k] = `(ก้อน ${Object.keys(v).length} ช่อง)`;
    else out[k] = `(ข้อความ ${String(v).length} ตัวอักษร)`;        // ไม่คืนเนื้อข้อความ
  }
  return out;
}

export const hint = (keys) => keys.filter((k) => COST_HINTS.some((w) => k.toLowerCase().includes(w)));

async function getJson(h, path) {
  try {
    const r = await fetch(`${BASE}${path}`, { headers: h, signal: AbortSignal.timeout(12000) });
    const body = r.ok ? await r.json().catch(() => null) : null;
    return { status: r.status, body };
  } catch (e) {
    /* ⚠️ ยิงไม่สำเร็จ ≠ ไม่มีเส้นนี้ — ต้องแยกให้คนอ่านเห็น ไม่งั้นจะสรุปว่า "ZORT ไม่มี" */
    return { status: null, error: String(e?.message || e).slice(0, 120) };
  }
}

/* เส้นรายละเอียดสินค้าที่จะลอง — กวาดคู่ ไม่ใช่นึกทีละชื่อ
   รวมรูปเอกพจน์/พหูพจน์ และรูปชื่อที่ ZORT ใช้จริงในโมดูลอื่น (GetBundleDetail) */
const DETAIL_PATHS = (id) => [
  ["Product/GetProductDetail", `/Product/GetProductDetail?id=${id}`],
  ["Product/GetProduct", `/Product/GetProduct?id=${id}`],
  ["Product/GetProductById", `/Product/GetProductById?id=${id}`],
  ["Product/GetProductDetails", `/Product/GetProductDetails?id=${id}`],
  ["Product/GetProductStock", `/Product/GetProductStock?id=${id}`],
  ["Product/GetProductCost", `/Product/GetProductCost?id=${id}`],
  /* 🧪 ตัวควบคุม: ชื่อที่ไม่มีอยู่จริง — ต้องได้ 404/ผิดพลาด
     ถ้าตัวควบคุมตอบ 200 เหมือนตัวอื่น แปลว่า 200 ไม่ได้บอกว่า "มีเส้นนี้" ⇒ ผลชุดนี้ใช้ตัดสินไม่ได้ */
  ["🧪 ตัวควบคุม: เส้นที่ไม่มีอยู่จริง", `/Product/GetProductไม่มีเส้นนี้จริง?id=${id}`],
];

export async function zortProductFieldsProbe(skuIn) {
  const h = headers();
  if (!h) return { skip: "ยังไม่ได้ตั้งรหัส ZORT" };

  /* ① รายการสินค้า — ก้อนดิบ ไม่ผ่านตัวคัด */
  const sku = String(skuIn ?? "").trim().slice(0, 60);
  const listPath = sku
    ? `/Product/GetProducts?searchsku=${encodeURIComponent(sku)}&limit=1`
    : `/Product/GetProducts?limit=1&page=1`;
  const got = await getJson(h, listPath);
  const first = Array.isArray(got.body?.list) ? got.body.list[0] : null;
  const listKeys = first ? Object.keys(first) : [];

  const out = {
    ok: true,
    ถามอะไร: "ZORT ส่งช่องต้นทุน (ถัวเฉลี่ย/มูลค่าสต็อก) มาให้ดึงได้ไหม",
    "⚠️ ข้อจำกัด": "ดูจากสินค้า 1 ตัว ⇒ ช่องที่ตัวนี้ว่างอาจมีค่าในตัวอื่น · ชื่อช่องครบแต่ 'มีค่าไหม' ยังต้องสุ่มเพิ่ม",
    รายการสินค้า: {
      เส้น: "Product/GetProducts",
      status: got.status,
      error: got.error ?? null,
      จำนวนช่องที่ส่งมา: listKeys.length || null,
      ชื่อช่องทั้งหมด: listKeys,
      ช่องที่น่าจะเป็นต้นทุน: hint(listKeys),
      ค่าที่เห็น: first ? shape(first) : null,
    },
    เส้นรายละเอียด: [],
  };

  /* ② เส้นรายละเอียดรายตัว — เผื่อมีช่องที่รายการรวมไม่ส่งมา (แบบ GetBundleDetail) */
  const id = first?.id;
  if (id === undefined || id === null) {
    out.เส้นรายละเอียด = null;
    out["หมายเหตุเส้นรายละเอียด"] = "ไม่ได้ id ของสินค้าจากรายการ ⇒ ยังไม่ได้ลองเส้นรายละเอียดเลย (ไม่ใช่ว่าไม่มี)";
  } else {
    for (const [name, path] of DETAIL_PATHS(id)) {
      const r = await getJson(h, path);
      /* ZORT ห่อคำตอบไม่เหมือนกันทุกเส้น — ลองทั้ง 3 รูปที่เคยเจอจริง */
      const obj = r.body && typeof r.body === "object"
        ? (r.body.product ?? r.body.data ?? (Array.isArray(r.body.list) ? r.body.list[0] : r.body))
        : null;
      const keys = obj && typeof obj === "object" && !Array.isArray(obj) ? Object.keys(obj) : [];
      out.เส้นรายละเอียด.push({
        เส้น: name,
        status: r.status,
        error: r.error ?? null,
        จำนวนช่อง: keys.length || null,
        ช่องที่รายการรวมไม่มี: keys.filter((k) => !listKeys.includes(k)),
        ช่องที่น่าจะเป็นต้นทุน: hint(keys),
      });
    }
    const ctrl = out.เส้นรายละเอียด.find((x) => x.เส้น.startsWith("🧪"));
    /* 🔴 ตัวควบคุมต้อง "ไม่ได้ผลแบบเดียวกับของจริง" ไม่งั้นผลทั้งชุดใช้ตัดสินไม่ได้ */
    out.ตัวควบคุมถูกปฏิเสธจริง = ctrl ? !(ctrl.status === 200 && (ctrl.จำนวนช่อง || 0) > 0) : null;
    if (out.ตัวควบคุมถูกปฏิเสธจริง === false)
      out["🔴 เตือน"] = "ตัวควบคุม (ชื่อเส้นที่ไม่มีจริง) ก็ตอบ 200 พร้อมข้อมูล ⇒ status 200 ไม่ได้แปลว่ามีเส้นนั้น · ผลชุดนี้ใช้ตัดสินไม่ได้";
  }

  const found = [...out.รายการสินค้า.ช่องที่น่าจะเป็นต้นทุน,
    ...(out.เส้นรายละเอียด || []).flatMap((x) => x.ช่องที่น่าจะเป็นต้นทุน || [])];
  out.สรุป = found.length
    ? `เจอช่องที่ชื่อสื่อถึงต้นทุน: ${[...new Set(found)].join(" · ")} — ต้องเทียบค่ากับของจริงก่อนใช้ (ชื่อสื่อถึง ≠ เป็นตัวนั้น)`
    : "ไม่เจอช่องต้นทุนอื่นนอกจาก purchaseprice ในสินค้าตัวที่ลอง ⇒ ยังไม่ปิดประตู ต้องสุ่มสินค้าหลายตัว/ถาม ZORT ก่อนสรุป";
  return out;
}
