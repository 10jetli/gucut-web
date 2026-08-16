// ที่อยู่ของเว็บ ฝั่ง serverless function
//
// อ่าน env ตัวเดียวกับหน้าเว็บ (NEXT_PUBLIC_SITE_URL) — ตั้งที่ Netlify ครั้งเดียว
// ได้ทั้งสองฝั่ง ไม่ต้องมีตัวแปรซ้ำซ้อนให้ลืมแก้ตัวใดตัวหนึ่ง
//
// ⚠️ ค่าสำรองต้องตรงกับ src/lib/site.ts

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://gucut.com").replace(/\/+$/, "");

/** ชื่อโดเมนล้วน ๆ ไว้ใส่ในข้อความที่คนอ่าน เช่น "gucut.com" */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
