/** ส่งข้อความเข้ากลุ่ม Telegram ของร้าน — จุดเดียวของทั้งระบบ
 *
 * 🔴 **ทำไมต้องแยกเป็นโมดูล** (18 ก.ย. 2569 — ท่านประธานเจอเอง)
 *    ท่านประธานได้ข้อความ "ออเดอร์ใหม่ #X0.2268697935047459 · ฿400 · ✅ เข้า ZORT แล้ว"
 *    รัวเข้ากลุ่มแอดมิน ทั้งที่ **ไม่มีออเดอร์นั้นในคลัง และไม่มีใน ZORT**
 *    ต้นตอ: `scripts/tests/points-account.test.mjs` สร้างออเดอร์ปลอม
 *    (`id: 'X' + Math.random()` · ฿430 ชิ้นเดียว · รวม ฿400 · Beam · เบอร์ 0811111111)
 *    แล้วเรียก `finalizeOrder` จริง ๆ
 *    มัน mock ไว้ครบทุกทาง — points · coupons · push · marketing · LINE — **ยกเว้น Telegram**
 *    เพราะ Telegram ถูกเรียกด้วย `fetch()` ตรง ๆ ในไฟล์ ไม่มีจุดให้ mock
 *
 *    ⚠️ ที่ระเบิดวันนี้เพราะ `npm test` ถูกใส่เข้า **prebuild** แล้ว
 *       ⇒ Netlify มี TELEGRAM_BOT_TOKEN/CHAT_ID ครบ ⇒ **ทุกครั้งที่ build เว็บ = ยิง 3 ข้อความจริง**
 *       ยิ่ง build บ่อย ยิ่งสแปม · และคนอ่านจะเริ่มเมินข้อความจากระบบนี้ทั้งหมด
 *       ซึ่งแปลว่าวันที่มีออเดอร์จริง อาจไม่มีใครเห็น
 *
 * 🔑 **สองชั้น ห้ามถอดชั้นไหนออก**
 *    ① แยกเป็นโมดูล ⇒ การทดสอบ mock ได้ (ทางที่ถูกต้อง)
 *    ② ตาข่ายกันลืม: เห็น `NODE_TEST_CONTEXT` เมื่อไหร่ = ไม่ส่งจริง
 *       (node ตั้งค่านี้ให้เองตอนรันด้วย `--test` · วัดจริงแล้ว = "child-v8")
 *       ⇒ ใครเขียนทดสอบใหม่แล้วลืม mock ก็ไม่สแปมท่านประธานอีก
 *    ⚠️ ชั้น ② เป็น **ตาข่าย ไม่ใช่ทางหลัก** — ถ้าวันหนึ่ง node เลิกตั้ง env ตัวนี้
 *       ชั้นนี้จะเงียบหายไปโดยไม่มีอะไรฟ้อง ชั้น ① จึงต้องอยู่เสมอ
 */

const กำลังรันทดสอบ = () => Boolean(process.env.NODE_TEST_CONTEXT);

/** ส่งเข้ากลุ่มร้าน · คืน {sent, why} เสมอ — ไม่โยน error ให้ล้มงานหลัก
 *  🔑 คืนเหตุผลด้วยทุกครั้ง เพราะ "ไม่ได้ส่ง" มีหลายสาเหตุที่ต้องแยกออกจากกัน
 *     (ยังไม่ตั้งค่า · อยู่ในโหมดทดสอบ · ส่งแล้วปลายทางปฏิเสธ) */
export async function notifyShop(text) {
  if (กำลังรันทดสอบ()) return { sent: false, why: "อยู่ในโหมดทดสอบ — ไม่ส่งจริง" };

  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return { sent: false, why: "ยังไม่ได้ตั้ง TELEGRAM_BOT_TOKEN/CHAT_ID" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    /* ⚠️ Telegram ตอบ 200 พร้อม `ok:false` ได้ (เช่นบอตถูกเตะออกจากกลุ่ม)
       ⇒ ดูรหัสสถานะอย่างเดียวไม่พอ ต้องอ่าน `ok` ในเนื้อด้วย */
    const j = await res.json().catch(() => null);
    if (j?.ok) return { sent: true };
    return { sent: false, why: String(j?.description || `HTTP ${res.status}`).slice(0, 160) };
  } catch (e) {
    return { sent: false, why: `ส่งไม่ถึง Telegram: ${e?.name || "Error"}` };
  }
}
