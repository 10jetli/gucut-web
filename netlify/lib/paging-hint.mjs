/* 📖 บอกผู้เรียกว่า "หน้าถัดไปเริ่มที่ไหน" — ที่เดียว ใช้ได้ทุกเส้นที่ไล่หน้า
 *
 * 🔴 คลาสบั๊กที่ตัวนี้ปิด (เจอของจริง 18 ก.ย. 2569):
 *    ฝั่งจอเขียนสคริปต์ไล่อ่านสินค้า สั่ง `limit=300` แล้ว **เดินหน้าทีละ 300**
 *    แต่เส้นนั้นให้ได้สูงสุด 200 ⇒ ข้ามแถวรอบละ 100 ⇒ ครอบได้ 1,800 จาก 2,673
 *    แล้ว **รายงานว่าไล่ครบ** เพราะ "ไล่จนหมด" ถูกเข้าใจว่า "ครบทั้งชุด"
 *    ⚠️ ท่อบอกอยู่แล้วด้วย `limitClamped:true` + `limitNote` — แต่ผู้เรียกไม่ได้อ่าน
 *
 * 🔑 บทเรียนเชิงออกแบบ: **ธงเตือนที่ต้องให้คนอ่านแล้วคำนวณเอง จะถูกข้าม**
 *    ถ้าเราคำนวณ "จุดเริ่มหน้าถัดไป" ให้เสร็จ ผู้เรียกไม่มีอะไรต้องคำนวณ ⇒ คลาสนี้ตายทั้งคลาส
 *    (ต่างจากการเติมคำเตือนอีกใบ ซึ่งเป็นการแก้อาการ ไม่ได้แก้เหตุ)
 *
 * ⚠️ ข้อห้ามของไฟล์นี้
 *  1. **ห้ามทับค่าที่ payload ส่งมาเอง** — บางเส้นรู้เรื่องการไล่หน้าของตัวเองดีกว่า (pageToken ฯลฯ)
 *  2. **จำนวนแถวน้อยกว่าที่ให้ = จบ** แต่ **เท่ากับที่ให้ ≠ ยังมีอีกแน่ ๆ** — เป็นแค่ "ต้องลองต่อ"
 *     ⇒ ใช้ชื่อ `pagingDone` (จบแล้วแน่) ไม่ใช่ `hasMore` (ซึ่งชวนให้อ่านว่ามีอีกแน่)
 *  3. ไม่มีอาเรย์แถวให้เห็น = **ไม่เดา** ⇒ ไม่เติมคีย์อะไรเลย (สามสถานะ: จบ · ต่อได้ · ไม่รู้)
 */

/* ชื่อคีย์อาเรย์แถวที่เส้นต่าง ๆ ใช้จริงในโปรเจกต์นี้ — เขียนตรงตัว **ห้ามเดาด้วย regex**
   (ชื่อที่คนตั้งเองมีคำของอย่างอื่นปนเสมอ — no-substring-classification) */
const ROW_KEYS = ["rows", "items", "list", "orders", "products", "contacts", "moves"];

export function rowsOf(obj) {
  for (const k of ROW_KEYS) if (Array.isArray(obj?.[k])) return obj[k];
  return null;
}

/** เติมคำใบ้การไล่หน้าให้คำตอบ — คืนออบเจกต์ใหม่ ไม่แก้ของเดิม
 * @param {object} obj     คำตอบที่จะส่งออก
 * @param {number|null} applied  limit ที่เส้นนี้ใช้จริง (หลังบีบเพดานแล้ว)
 * @param {object} q       ค่าที่ผู้เรียกส่งมา { offset, page }
 */
export function withPagingHint(obj, applied, q = {}) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  if (!Number.isFinite(applied) || applied <= 0) return obj;
  const rows = rowsOf(obj);
  if (rows === null) return obj;                      // ไม่รู้จำนวนแถว ⇒ ไม่เดา
  /* ข้อห้าม 1: payload บอกเองแล้ว ⇒ ไม่แตะ */
  if ("nextOffset" in obj || "nextPage" in obj || "pagingDone" in obj || "pageToken" in obj) return obj;

  const done = rows.length < applied;
  const out = {
    ...obj,
    pagingDone: done,
    /* 🔑 คำอธิบายให้คนอ่าน log เข้าใจได้ทันทีว่าทำไมต้องใช้ค่านี้ ไม่ใช่บวก limit ที่ขอเอง */
    pagingNote: done
      ? "ได้แถวน้อยกว่าที่ให้ต่อหน้า ⇒ จบชุดแล้ว"
      : "ยังอาจมีต่อ — **เดินหน้าด้วย nextOffset/nextPage นี้เท่านั้น ห้ามบวก limit ที่ขอไปเอง** (เส้นนี้บีบเพดานได้)",
  };
  if (done) { out.nextOffset = null; out.nextPage = null; return out; }

  const offset = Number.parseInt(q.offset ?? "", 10);
  const page = Number.parseInt(q.page ?? "", 10);
  if (Number.isFinite(page) && page > 0) out.nextPage = page + 1;
  /* เส้นที่ใช้ offset: ไม่ส่ง offset มา = เริ่มที่ 0 ⇒ หน้าถัดไปคือจำนวนแถวที่ได้จริง
     ⚠️ บวกด้วย **rows.length** ไม่ใช่ applied — ถ้าเส้นคืนน้อยกว่าเพดานโดยยังไม่จบ
        (เช่นกรองบางแถวออก) การบวก applied จะข้ามแถวเงียบ ๆ ซึ่งคือบั๊กที่ไฟล์นี้มีไว้ปิด */
  else out.nextOffset = (Number.isFinite(offset) && offset > 0 ? offset : 0) + rows.length;
  return out;
}
