// ส่งข้อความหาลูกค้าทาง LINE OA — @gucut1
//
// ---------------------------------------------------------------------------
// เจ้าของร้านเลือกช่องทางนี้เอง (26 ส.ค. 2569) เมื่อถามว่าจะแจ้งเตือนลูกค้าทางไหน
// เหตุผลที่มันเหมาะกับร้านนี้ที่สุด
//   · ลูกค้าไทยเปิด LINE ทุกวัน อัตราการอ่านสูงกว่าทุกช่องทาง
//   · ร้านมี OA อยู่แล้ว ไม่ต้องสมัครบริการใหม่
//   · เรามี LINE userId ของลูกค้าอยู่แล้วจากปุ่ม "เข้าสู่ระบบด้วย LINE"
//     (เก็บไว้ที่ u.social.line.id ตอนล็อกอิน — ดู netlify/lib/oauth.mjs)
//
// ⚠️ สองเงื่อนไขที่ทำให้ส่งไม่ถึง ต้องรู้ไว้ ไม่ใช่บั๊ก
//   1. ลูกค้าต้อง "เพิ่มเพื่อน" กับ @gucut1 ก่อน ไม่เป็นเพื่อน = ส่งไม่ได้ (LINE ตอบ 403)
//      คนที่กดเข้าสู่ระบบด้วย LINE ส่วนใหญ่จะถูกชวนเพิ่มเพื่อนตอนนั้น แต่ไม่ทุกคน
//   2. Messaging API channel ต้องอยู่ใน provider เดียวกับ Login channel
//      คนละ provider = userId คนละชุด ส่งไปก็ไม่เจอคน
//
// ⚠️ ยังไม่ได้ตั้ง LINE_MESSAGING_TOKEN = เงียบ ๆ ไม่ส่ง ห้ามโยน error
//    ตัวเตือนต้องเดินต่อไปใช้ช่องทางอื่นได้ ไม่ใช่ล้มทั้งงานเพราะยังไม่ได้ตั้งค่า
//
// ⚠️ ห้ามส่งข้อความขายของทางนี้
//    ช่องทางนี้มีไว้บอกความคืบหน้าเรื่องที่ลูกค้าเปิดไว้กับร้านเท่านั้น
//    ยิงโฆษณาเข้าไป = ลูกค้าบล็อก OA แล้วร้านเสียช่องทางติดต่อไปตลอด
//    และผิดกติกาของ LINE เรื่องข้อความที่ผู้รับไม่ได้ขอ
// ---------------------------------------------------------------------------

const API = "https://api.line.me/v2/bot/message/push";

export const lineReady = () => Boolean(process.env.LINE_MESSAGING_TOKEN);

/**
 * ส่งข้อความหาลูกค้าหนึ่งคน
 *
 * @param {string} userId  LINE userId (u.social.line.id)
 * @param {string} text    ข้อความ
 * @param {string} [url]   ลิงก์ให้กดกลับมาที่เว็บ
 * @returns {Promise<"sent"|"off"|"noid"|"blocked"|"error">}
 */
export async function linePush(userId, text, url) {
  const token = process.env.LINE_MESSAGING_TOKEN;
  if (!token) return "off";
  if (!userId) return "noid";

  // ⚠️ ต่อลิงก์ท้ายข้อความแทนการใช้ปุ่ม (template message)
  //    ปุ่มต้องใช้ HTTPS และ LINE ตรวจรูปแบบเข้มกว่า ข้อความธรรมดาพังยากกว่ามาก
  const body = url ? `${text}\n\n${url}` : text;

  try {
    const r = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to: userId, messages: [{ type: "text", text: body.slice(0, 4900) }] }),
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) return "sent";
    // 403 = ลูกค้ายังไม่ได้เพิ่มเพื่อน หรือบล็อก OA ไปแล้ว — ไม่ใช่ของพัง
    if (r.status === 403) return "blocked";
    return "error";
  } catch {
    return "error";
  }
}
