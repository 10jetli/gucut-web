// ที่อยู่ของเว็บ — จุดเดียวของทั้งโปรเจกต์
//
// วันที่ย้ายจาก new78.com ไป gucut.com ให้ตั้ง NEXT_PUBLIC_SITE_URL ที่ Netlify
// เป็น https://gucut.com เท่านั้น แล้วทุกที่ในเว็บเปลี่ยนตามเอง
// (หัวเว็บ · sitemap · JSON-LD · ฟีดสินค้า · ท้ายเว็บ · หน้านโยบาย)
//
// ⚠️ ชื่อตัวแปรต้องขึ้นต้นด้วย NEXT_PUBLIC_ เท่านั้น Next.js ถึงจะฝังค่าให้ตอน build
//    ตั้งชื่ออื่นแล้วค่าจะเป็น undefined ในเบราว์เซอร์ แล้วตกกลับมาใช้ค่าสำรองเงียบ ๆ
//
// ⚠️ ฝั่ง serverless function อ่านค่าตัวเดียวกันนี้ที่ netlify/lib/site.mjs
//    ถ้าแก้ค่าสำรองตรงนี้ ต้องแก้ที่นั่นให้ตรงกันด้วย

/** เช่น "https://new78.com" — ไม่มี / ปิดท้าย */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://new78.com").replace(/\/+$/, "");

/** ชื่อโดเมนล้วน ๆ ไว้โชว์ให้คนอ่าน เช่น "new78.com" */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
