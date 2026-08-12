// เข้าสู่ระบบด้วย LINE — ตัวจริงอยู่ที่ netlify/lib/oauth.mjs
//
// ต้องตั้ง env ที่ Netlify → Site settings → Environment variables:
//   LINE_CHANNEL_ID       Channel ID จาก developers.line.biz (ช่องแบบ LINE Login)
//   LINE_CHANNEL_SECRET   Channel secret ของช่องเดียวกัน
//   NEXT_PUBLIC_LINE_LOGIN=1   ให้ปุ่มบนหน้าเว็บทำงาน
// และที่หน้า LINE Login → Callback URL ใส่:
//   https://new78.com/api/oauth/line/callback
import { LINE, handleOAuth } from "../lib/oauth.mjs";

export default (req) => handleOAuth(req, LINE);

export const config = { path: ["/api/oauth/line", "/api/oauth/line/callback"] };
