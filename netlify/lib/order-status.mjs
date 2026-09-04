// แปลสถานะฝั่งมาร์เก็ตเพลส (integration_status) ให้เป็นคำที่คนอ่านรู้เรื่อง
//
// ⚠️ **ค่าดิบมาจาก 3 แพลตฟอร์ม และเขียนคนละแบบ** (ฝั่งจอไขว้ข้อมูลจริงยืนยัน 4 ก.ย. 2569)
//    ตัวพิมพ์ใหญ่  = Shopee  (COMPLETED · SHIPPED · READY_TO_SHIP · CANCELLED …)
//    ตัวพิมพ์เล็ก  = Lazada  (delivered · confirmed · shipped · pending · ready_to_ship …)
//    ตัวเลข        = TikTok  (121 · 122 · 130 · 140 …)
//
// ⚠️ **ห้าม lowercase แล้วรวบทีเดียว** — `ready_to_ship` กับ `READY_TO_SHIP`
//    **ไม่ใช่ค่าเดียวกันเขียนสองแบบ แต่เป็นคนละเจ้า** ถ้ารวบ วันที่ Lazada ออกค่าใหม่
//    ที่สะกดชนกับ Shopee เราจะแปลผิดโดยไม่มีอะไรฟ้อง
//    ⇒ เทียบ **ตรงตัว** จากตารางข้างล่าง (กติกาเดียวกับ no-substring-classification)
//
// ⚠️ **ค่าที่ไม่รู้จักต้องตกถัง "ไม่รู้จัก" ที่เห็นบนจอ ห้ามยัดรวมกับ "อื่น ๆ"**
//    ไม่งั้นวันที่แพลตฟอร์มเพิ่มค่าใหม่ มันจะหายเงียบแบบเดียวกับ nets-expire-silently
//
// ⚠️ **ส่งค่าดิบกลับไปคู่กันเสมอ** — จอต้องโชว์ของจริงได้ตอนไล่ปัญหา

/** ค่าดิบ → { th, platform, group } · เทียบตรงตัวเท่านั้น */
const MAP = {
  // ── Shopee (ตัวพิมพ์ใหญ่) ──
  READY_TO_SHIP: { th: "รอจัดส่ง", platform: "shopee", group: "waiting_ship" },
  SHIPPED: { th: "จัดส่งแล้ว", platform: "shopee", group: "shipping" },
  TO_CONFIRM_RECEIVE: { th: "รอผู้ซื้อกดรับ", platform: "shopee", group: "shipping" },
  COMPLETED: { th: "สำเร็จ", platform: "shopee", group: "done" },
  CANCELLED: { th: "ยกเลิก", platform: "shopee", group: "cancelled" },
  TO_RETURN: { th: "รอคืนสินค้า", platform: "shopee", group: "returning" },

  // ── Lazada (ตัวพิมพ์เล็ก) ──
  pending: { th: "รอยืนยัน", platform: "lazada", group: "waiting_confirm" },
  confirmed: { th: "ยืนยันแล้ว", platform: "lazada", group: "waiting_ship" },
  ready_to_ship: { th: "รอจัดส่ง", platform: "lazada", group: "waiting_ship" },
  shipped: { th: "จัดส่งแล้ว", platform: "lazada", group: "shipping" },
  delivered: { th: "ส่งถึงแล้ว", platform: "lazada", group: "done" },
  canceled: { th: "ยกเลิก", platform: "lazada", group: "cancelled" },
  returned: { th: "ตีกลับ", platform: "lazada", group: "returning" },
  shipped_back_success: { th: "ตีกลับถึงร้านแล้ว", platform: "lazada", group: "returning" },
  failed_delivery: { th: "ส่งไม่สำเร็จ", platform: "lazada", group: "problem" },
  lost_by_3pl: { th: "ขนส่งทำหาย", platform: "lazada", group: "problem" },

  /* ── TikTok Shop (รหัสตัวเลข) ──
     ⚠️ **ยังไม่ได้ยืนยันกับเอกสารทางการของ TikTok** — มาจากความจำของฝั่งจอ
        และ **ตรงกับค่าที่พบจริงในข้อมูล 4 ตัว (121 · 122 · 130 · 140)**
        ⇒ ใช้ได้ระดับ "น่าจะใช่" ไม่ใช่ "ยืนยันแล้ว"
        ที่ไม่พบในข้อมูลเลย (100 · 105 · 111 · 112 · 114) ใส่ไว้เผื่อ แต่ยังไม่เคยเห็นของจริง */
  100: { th: "ยังไม่จ่าย", platform: "tiktok", group: "waiting_pay", unverified: true },
  105: { th: "พักไว้", platform: "tiktok", group: "problem", unverified: true },
  111: { th: "รอจัดส่ง", platform: "tiktok", group: "waiting_ship", unverified: true },
  112: { th: "รอเข้ารับ", platform: "tiktok", group: "waiting_ship", unverified: true },
  114: { th: "ส่งบางส่วน", platform: "tiktok", group: "shipping", unverified: true },
  121: { th: "กำลังส่ง", platform: "tiktok", group: "shipping", unverified: true },
  122: { th: "ส่งถึงแล้ว", platform: "tiktok", group: "done", unverified: true },
  130: { th: "สำเร็จ", platform: "tiktok", group: "done", unverified: true },
  140: { th: "ยกเลิก", platform: "tiktok", group: "cancelled", unverified: true },
};

/** ชื่อไทยของกลุ่ม — จอเอาไปตั้งชื่อแท็บได้เลย */
export const GROUP_TH = {
  waiting_pay: "รอชำระเงิน",
  waiting_confirm: "รอยืนยัน",
  waiting_ship: "รอจัดส่ง",
  shipping: "กำลังจัดส่ง",
  done: "สำเร็จ",
  cancelled: "ยกเลิก",
  returning: "ตีกลับ/คืนสินค้า",
  problem: "มีปัญหา",
  unknown: "ไม่รู้จัก", // ⚠️ ถังนี้ต้องเห็นบนจอเสมอ ห้ามซ่อน
};

/**
 * แปลค่าดิบหนึ่งค่า
 * @returns {{raw:string|null, th:string, group:string, platform:string|null,
 *            known:boolean, unverified?:boolean}}
 */
export function readStatus(raw) {
  const key = String(raw ?? "").trim();
  if (!key) return { raw: null, th: "—", group: "blank", platform: null, known: true };
  const hit = MAP[key];
  if (!hit) {
    // ⚠️ ไม่รู้จัก = บอกตรง ๆ พร้อมค่าดิบ ห้ามเดา ห้ามยัดรวมกับกลุ่มอื่น
    return { raw: key, th: `ไม่รู้จัก (${key})`, group: "unknown", platform: null, known: false };
  }
  return {
    raw: key,
    th: hit.th,
    group: hit.group,
    platform: hit.platform,
    known: true,
    ...(hit.unverified ? { unverified: true } : {}),
  };
}

/** สรุปเป็นกอง — ไว้ทำการ์ด/แท็บ · คืนค่าดิบที่อยู่ในแต่ละกองมาด้วย */
export function groupStatuses(rows = []) {
  const acc = new Map();
  for (const r of rows) {
    const s = readStatus(r?.integrationStatus ?? r?.integration_status);
    const g = acc.get(s.group) || { group: s.group, th: GROUP_TH[s.group] || s.group, count: 0, raws: new Set() };
    g.count += 1;
    if (s.raw) g.raws.add(s.raw);
    acc.set(s.group, g);
  }
  return [...acc.values()]
    .map((g) => ({ ...g, raws: [...g.raws] }))
    .sort((a, b) => b.count - a.count);
}
