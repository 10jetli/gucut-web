// ส่ง LINE หาลูกค้าเจ้าของออเดอร์ — หาตัวลูกค้าจากเบอร์โทรผู้รับ
//
// ใช้ได้เฉพาะลูกค้าที่ล็อกอินเว็บด้วย LINE (มี u.social.line.id) และเพิ่มเพื่อน @gucut1
// นอกนั้นเงียบ ๆ ไม่ใช่ error — การแจ้งเตือนเป็นของแถม ห้ามทำออเดอร์พัง
//
// ⚠️ ช่องทางนี้ส่งได้เฉพาะความคืบหน้าของออเดอร์ลูกค้าเอง ห้ามส่งโฆษณา
//    (กติกาเดียวกับ line-push.mjs — ยิงขายของ = ลูกค้าบล็อก OA เสียช่องทางถาวร)

import { linePush } from "./line-push.mjs";
import { normPhone, store as usersStore } from "./session.mjs";

/**
 * @returns {Promise<"sent"|"off"|"noid"|"blocked"|"error">}
 */
export async function lineToCustomer(phone, text, url) {
  try {
    const s = usersStore();
    const u = await s.get(`u/${normPhone(phone)}`, { type: "json" }).catch(() => null);
    const id = u?.social?.line?.id;
    if (!id) return "noid";
    return await linePush(id, text, url);
  } catch {
    return "error";
  }
}
