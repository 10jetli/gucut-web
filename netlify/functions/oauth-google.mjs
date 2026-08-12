// เข้าสู่ระบบด้วย Google — ตัวจริงอยู่ที่ netlify/lib/oauth.mjs
//
// ต้องตั้ง env ที่ Netlify → Site settings → Environment variables:
//   GOOGLE_CLIENT_ID          Client ID จาก Google Cloud Console
//   GOOGLE_CLIENT_SECRET      Client secret ของตัวเดียวกัน
//   NEXT_PUBLIC_GOOGLE_LOGIN=1    ให้ปุ่มบนหน้าเว็บทำงาน
// และที่ Google Cloud Console → Credentials → OAuth client →
//   Authorized redirect URIs ใส่:
//   https://new78.com/api/oauth/google/callback
import { GOOGLE, handleOAuth } from "../lib/oauth.mjs";

export default (req) => handleOAuth(req, GOOGLE);

export const config = { path: ["/api/oauth/google", "/api/oauth/google/callback"] };
