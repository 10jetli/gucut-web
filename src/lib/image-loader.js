// Image CDN loader — ทุกรูปในเว็บวิ่งผ่าน Netlify Image CDN
// ย่อขนาดตามจอจริง + แปลงเป็น WebP/AVIF อัตโนมัติ + cache ที่ edge
// (เดิมโหลดรูปเต็ม 1000px จาก Shopify มาแสดงในกรอบ 140px — เปลือง ~7 เท่า)
export default function netlifyImageLoader({ src, width, quality }) {
  const params = new URLSearchParams({
    url: src,
    w: String(width),
    q: String(quality || 75),
  });
  return `/.netlify/images?${params}`;
}
