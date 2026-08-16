// เข้าสู่ระบบด้วย Google — ตัวจริงอยู่ที่ netlify/lib/oauth.mjs
//
// ต้องตั้ง env ที่ Netlify → Site settings → Environment variables:
//   GOOGLE_CLIENT_ID          Client ID จาก Google Cloud Console
//   GOOGLE_CLIENT_SECRET      Client secret ของตัวเดียวกัน
//   NEXT_PUBLIC_GOOGLE_LOGIN=1    ให้ปุ่มบนหน้าเว็บทำงาน
// และที่ Google Cloud Console → Credentials → OAuth client →
//   Authorized redirect URIs ใส่:
//   https://new78.com/api/oauth/google/callback
//   ⚠️ วันย้ายโดเมนไป gucut.com ต้อง "กลับมาแก้ที่นี่ด้วย" — เปลี่ยน NEXT_PUBLIC_SITE_URL
//      อย่างเดียวไม่พอ ปุ่มเข้าสู่ระบบจะพังทันทีถ้า redirect URI ฝั่งผู้ให้บริการไม่ตรง
import { GOOGLE, handleOAuth } from "../lib/oauth.mjs";

export default (req) => handleOAuth(req, GOOGLE);

export const config = { path: ["/api/oauth/google", "/api/oauth/google/callback"] };
