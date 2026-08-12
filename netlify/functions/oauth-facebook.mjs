// เข้าสู่ระบบด้วย Facebook — ตัวจริงอยู่ที่ netlify/lib/oauth.mjs
//
// ต้องตั้ง env ที่ Netlify → Site settings → Environment variables:
//   FACEBOOK_APP_ID           App ID จาก developers.facebook.com
//   FACEBOOK_APP_SECRET       App secret ของแอปเดียวกัน
//   NEXT_PUBLIC_FACEBOOK_LOGIN=1   ให้ปุ่มบนหน้าเว็บทำงาน
//   FACEBOOK_API_VERSION      ไม่ใส่ก็ได้ ค่าเริ่มต้น v23.0
// และที่แอป → Facebook Login → Settings → Valid OAuth Redirect URIs ใส่:
//   https://new78.com/api/oauth/facebook/callback
import { FACEBOOK, handleOAuth } from "../lib/oauth.mjs";

export default (req) => handleOAuth(req, FACEBOOK);

export const config = { path: ["/api/oauth/facebook", "/api/oauth/facebook/callback"] };
