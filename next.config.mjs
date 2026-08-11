/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phase 1 (mock data) — export เป็น static site อัปโหลดที่ไหนก็ได้
  // Phase 2 ต่อ Shopify จริง: ลบ output กับ unoptimized ออก แล้ว deploy แบบ SSR บน Netlify
  output: "export",
  trailingSlash: true,
  images: {
    // ทุกรูปผ่าน Netlify Image CDN — ย่อ/แปลง WebP ตามจอจริง (ดู src/lib/image-loader.js)
    // หมายเหตุ: ตอน `npm run dev` ในเครื่อง รูปจะไม่ขึ้น (ไม่มี /.netlify/images) — ปกติ
    loader: "custom",
    loaderFile: "./src/lib/image-loader.js",
    // อนุญาตรูปสินค้าจาก Shopify CDN
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
      // รูปในรีวิวลูกค้า — โฮสต์ถาวรของแต่ละแพลตฟอร์ม
      { protocol: "https", hostname: "lzd-u.slatic.net" },
      { protocol: "https", hostname: "sg-test-11.slatic.net" },
      { protocol: "https", hostname: "cf.shopee.com" },
      { protocol: "https", hostname: "down-th.img.susercontent.com" },
      { protocol: "https", hostname: "p16-oec-sg.ibyteimg.com" },
      { protocol: "https", hostname: "p16-oec-va.ibyteimg.com" },
    ],
  },
};

export default nextConfig;
