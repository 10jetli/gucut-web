/** 🔒 สมการปิดของรอบกวาดดันสต็อก — **ที่เดียวในระบบที่เขียนสมการนี้ไว้**
 *
 *   planned = fired + not_sent + not_fired
 *   fired   = pushed + rejected          (เป๊ะเสมอ — ทุกแถวที่เข้ายิงได้ผลกลับมาหมด)
 *
 * · `not_sent`  = ถูกคัดออก **ก่อน** ยิง (stale_plan · needs_human · ด่านอื่น)
 * · `not_fired` = ยกไปรอบหน้าเพราะงบเวลา
 * 🚫 **`skipped` ห้ามเข้าสมการ** — มันคือแถวที่ถูกกรองออก**ก่อนเข้าแผน** (`แถว.length − p.push.length`)
 *    ไม่ได้อยู่ในตัวตั้ง `planned` ตั้งแต่ต้น ⇒ เอามาบวกคือนับซ้ำ
 *
 * 🔑 เหตุที่ต้องเป็นตัวคิด ไม่ใช่คอมเมนต์: เคยส่งสูตรผิดให้ฝั่งจอ
 *    (`notSent = fired − pushed − rejected` ซึ่ง **เป็น 0 ตลอดกาล** เพราะ fired = pushed + rejected เป๊ะ)
 *    สูตรที่เขียนไว้เฉย ๆ ไม่มีอะไรจับได้ว่าผิด · สูตรที่ถูกคิดทุกรอบจับได้ทันทีที่ไม่ลง
 *
 * ⚠️ **"ไม่รู้" ต้องไม่ถูกอ่านว่า "ไม่ผ่าน"** — รอบที่ไม่ได้ยิงเลย จะไม่มีค่า not_sent/not_fired
 *    ⇒ คืน `{ ตรวจได้: false }` **และต้องไม่มีคีย์ `ลง`** (กติกาเดียวกับ `inconclusive` ที่ตกลงกับฝั่งจอ)
 */
export function ตรวจสมการรอบกวาด({ planned, fired, not_sent, not_fired } = {}) {
  const เลข = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const p = เลข(planned), f = เลข(fired), ns = เลข(not_sent), nf = เลข(not_fired);
  const ขาด = [
    ["planned", p], ["fired", f], ["not_sent", ns], ["not_fired", nf],
  ].filter(([, v]) => v === null).map(([k]) => k);
  if (ขาด.length)
    return {
      ตรวจได้: false,
      เหตุ: `ยังไม่รู้ค่า: ${ขาด.join(", ")} ⇒ รอบนี้พิสูจน์สมการไม่ได้ (ไม่ใช่ว่าไม่ผ่าน)`,
      สมการ: "planned = fired + not_sent + not_fired",
    };
  const ผลรวม = f + ns + nf;
  return {
    ตรวจได้: true,
    ลง: p === ผลรวม,
    สมการ: "planned = fired + not_sent + not_fired",
    ...(p === ผลรวม
      ? {}
      : {
          ต่างกัน: p - ผลรวม,
          "⚠️ สมการไม่ลง": `planned ${p} ≠ fired ${f} + not_sent ${ns} + not_fired ${nf} = ${ผลรวม}` +
            ` ⇒ มีแถวที่หลุดออกจากทั้งสามกอง หรือถูกนับสองกอง · ห้ามอ่านตัวเลขรอบนี้ว่าครอบคลุมครบ`,
        }),
  };
}
