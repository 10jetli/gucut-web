// เข้าสู่ระบบด้วย LINE — ตัวจริงอยู่ที่ netlify/lib/oauth.mjs
//
// ต้องตั้ง env ที่ Netlify → Site settings → Environment variables:
//   LINE_CHANNEL_ID       Channel ID จาก developers.line.biz (ช่องแบบ LINE Login)
//   LINE_CHANNEL_SECRET   Channel secret ของช่องเดียวกัน
//   NEXT_PUBLIC_LINE_LOGIN=1   ให้ปุ่มบนหน้าเว็บทำงาน
// และที่หน้า LINE Login → Callback URL ใส่:
//   https://gucut.com/api/oauth/line/callback
//   ⚠️ วันย้ายโดเมนไป gucut.com ต้อง "กลับมาแก้ที่นี่ด้วย" — เปลี่ยน NEXT_PUBLIC_SITE_URL
//      อย่างเดียวไม่พอ ปุ่มเข้าสู่ระบบจะพังทันทีถ้า redirect URI ฝั่งผู้ให้บริการไม่ตรง
import { LINE, handleOAuth } from "../lib/oauth.mjs";

export default (req) => handleOAuth(req, LINE);

export const config = { path: ["/api/oauth/line", "/api/oauth/line/callback"] };
