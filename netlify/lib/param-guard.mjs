/* 🛡️ ด่านค่าพารามิเตอร์ของ /api/core — ทั้งคลาสที่เดียว (15 ก.ย. 2569 · ใบ t_mu2pekwt เทียบทีละหน้า ยิงลึก)
   ยิงลึกทุกเส้นที่จอใช้แล้วพบ "ค่าผิดได้ผลว่างที่หน้าตาเหมือนข้อมูลจริง" (HTTP 200 · ok:true):
   · วันที่เป็นไปไม่ได้ผ่านด่านรูปแบบ /^\d{4}-\d{2}-\d{2}$/ — list=orders&from=2026-13-40 ได้ 0 ใบ · sales · topproducts ก็ 0
     (ฐานเทียบเป็นข้อความ ⇒ '2026-13-40' มากกว่าทุกวันจริง) · from > to ได้ 0 ใบ · orderfacets from=abc ไม่ตรวจเลย
   · ตัวเลขที่ไม่ใช่ตัวเลขถูกปัดเป็นค่าเริ่มต้นเงียบ ๆ — deadstock&days=abc ได้ 90 วัน (ไม่สะท้อนกลับ) · stock&limit=abc ได้ 50
   ⇒ ตอบ 400 พร้อมเหตุผลไทย **ก่อนถึงเส้นใดเลย** · ค่าว่าง (`limit=`) = ไม่ได้ส่ง ใช้ค่าเริ่มต้นเหมือนเดิม
   ⚠️ ตรวจวันที่เฉพาะเส้นที่ใช้วันที่กรองข้อมูลจริง (DATE_LISTS) — เส้นเครื่องมืออื่นที่รับ day แบบอื่นไม่แตะ
   ⚠️ จอเดิมส่งวันที่จาก thaiDay()/ช่องเลือกวัน (YYYY-MM-DD) และตัวเลขจาก String(number) ⇒ ไม่โดนด่าน */
/* 🔑 **คำที่ถือว่า "ใบยกเลิก" — แหล่งเดียวของทั้งระบบ** (16 ต.ค. 2569 · ใบ t_mva0li5s)
   ใช้สองที่ที่ต้องตรงกันเสมอ ไม่งั้นได้คำตอบที่ขัดกันเอง:
     ① `CANCEL_SQL` ใน `core-orders.mjs` — ประโยคที่ **ตัดกองใบยกเลิกออก** จากประชากร
     ② ด่านข้างล่าง — ที่ห้ามคำขอที่ **ขัดกันเอง** (ขอสถานะยกเลิก ในประชากรที่ตัดยกเลิกออก)
   ⚠️ ที่นี่ใช้การเทียบแบบ **สตริงย่อย** ซึ่งปกติเป็นของห้าม (`no-substring-classification`)
      แต่ตรงนี้ **ถูก** เพราะต้องสะท้อน `LIKE '%cancel%'` ของ SQL ให้เป๊ะ
      ⇒ ถ้าวันหนึ่งเปลี่ยน SQL เป็นเทียบตรงตัว **ต้องเปลี่ยนที่นี่ด้วย ไม่งั้นสองฝั่งตอบคนละอย่าง** */
export const CANCEL_WORDS = ["cancel", "void", "ยกเลิก"];
export const isCancelLike = (v) => {
  const s = String(v ?? "").toLowerCase();
  return CANCEL_WORDS.some((w) => s.includes(w));
};

export const DATE_LISTS = new Set(["orders", "orderfacets", "topproducts", "sales", "stockcard", "purchaseitems", "purchases", "logistics"]);

/** วันที่จริงตามปฏิทิน — รูปถูกไม่พอ ต้องย้อนกลับเป็นข้อความเดิมได้ (2026-02-30 → 2026-03-02 ⇒ ไม่ผ่าน) */
export function isRealDay(s) {
  const v = String(s ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** @param {URLSearchParams} sp @returns {string|null} ข้อความ error ไทย หรือ null = ผ่าน */
export function badParamError(sp) {
  for (const k of ["limit", "offset", "days"]) {
    if (!sp.has(k)) continue;
    const v = String(sp.get(k) ?? "").trim();
    if (v === "") continue;
    if (!/^\d+$/.test(v)) return `${k} ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป (ได้มา "${v.slice(0, 20)}")`;
  }
  if (DATE_LISTS.has(sp.get("list"))) {
    for (const k of ["from", "to", "day", "shipfrom", "shipto"]) {
      const v = String(sp.get(k) ?? "").trim();
      if (v && !isRealDay(v)) return `${k} ต้องเป็นวันที่จริงรูป YYYY-MM-DD (ได้มา "${v.slice(0, 20)}")`;
    }
    const f = String(sp.get("from") ?? "").trim();
    const t = String(sp.get("to") ?? "").trim();
    if (f && t && f > t) return `from (${f}) ต้องไม่มากกว่า to (${t})`;
    // ตัวกรองค้นหาขั้นสูงของรายการขาย (15 ก.ย. 2569) — ช่วงวันส่ง · ช่วงมูลค่า · COD
    const sf = String(sp.get("shipfrom") ?? "").trim();
    const stt = String(sp.get("shipto") ?? "").trim();
    if (sf && stt && sf > stt) return `shipfrom (${sf}) ต้องไม่มากกว่า shipto (${stt})`;
    for (const k of ["amountmin", "amountmax"]) {
      const v = String(sp.get(k) ?? "").trim();
      if (v && !/^\d+(\.\d+)?$/.test(v)) return `${k} ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป (ได้มา "${v.slice(0, 20)}")`;
    }
    const amin = String(sp.get("amountmin") ?? "").trim();
    const amax = String(sp.get("amountmax") ?? "").trim();
    if (amin && amax && Number(amin) > Number(amax)) return `amountmin (${amin}) ต้องไม่มากกว่า amountmax (${amax})`;
    const cod = String(sp.get("cod") ?? "").trim();
    if (cod && cod !== "0" && cod !== "1") return `cod ต้องเป็น 1 (เก็บเงินปลายทาง) หรือ 0 (ไม่ใช่) (ได้มา "${cod.slice(0, 10)}")`;
    if (sp.get("list") === "orders" || sp.get("list") === "orderfacets") {
      const rawStatus = String(sp.get("status") ?? "");
      if (rawStatus) {
        const values = rawStatus.split(",");
        if (values.length > 10) return `status รับได้สูงสุด 10 ค่า (ได้มา ${values.length} ค่า)`;
        if (values.some((v) => !v.trim())) return "status หลายค่าต้องคั่นด้วยจุลภาคและห้ามมีค่าว่าง";
        if (values.some((v) => v.trim().length > 60)) return "status แต่ละค่าต้องยาวไม่เกิน 60 ตัวอักษร";
      }
      const dateType = String(sp.get("datetype") ?? "").trim();
      if (dateType && !["order", "ship"].includes(dateType)) {
        return dateType === "payment"
          ? "datetype=payment ยังใช้ไม่ได้ — กระจกยังไม่มีวันชำระเงินจาก ZORT (รองรับ order หรือ ship)"
          : `datetype ต้องเป็น order หรือ ship (ได้มา "${dateType.slice(0, 20)}")`;
      }
    }
  }
  if (sp.get("list") === "stock") {
    for (const k of ["sellmin", "sellmax", "buymin", "buymax"]) {
      const v = String(sp.get(k) ?? "").trim();
      if (v && !/^\d+(\.\d+)?$/.test(v)) return `${k} ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป (ได้มา "${v.slice(0, 20)}")`;
    }
    for (const [lo, hi] of [["sellmin", "sellmax"], ["buymin", "buymax"]]) {
      const a = String(sp.get(lo) ?? "").trim();
      const b = String(sp.get(hi) ?? "").trim();
      if (a && b && Number(a) > Number(b)) return `${lo} (${a}) ต้องไม่มากกว่า ${hi} (${b})`;
    }
    const kind = String(sp.get("kind") ?? "").trim();
    if (kind && !["goods", "service", "all"].includes(kind)) return `kind ต้องเป็น goods / service / all (ได้มา "${kind.slice(0, 20)}")`;
    if (String(sp.get("warehouse") ?? "").trim()) return "warehouse ยังใช้กับ list=stock ไม่ได้ — กระจกไม่มียอดสต็อกรายคลัง";
    if (String(sp.get("tag") ?? "").trim()) return "tag ยังใช้กับ list=stock ไม่ได้ — ตาราง products ยังไม่เก็บ Tag จาก ZORT";
    const archived = String(sp.get("archived") ?? "").trim();
    if (archived && archived !== "0") return "archived ยังใช้กับ list=stock ไม่ได้ — กระจกไม่เก็บสินค้าที่ถูกลบจาก ZORT";
  }
  return null;
}
