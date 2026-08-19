// รูปแบนเนอร์หน้าแรก — สูตรสร้าง URL อยู่ที่นี่ที่เดียว
//
// ⚠️ ต้องอยู่ในไฟล์ที่ "ไม่ใช่ client component" เพราะทั้งสองฝั่งต้องใช้
//    หน้าแรก (ฝั่งเซิร์ฟเวอร์) ใช้สร้างแท็กสั่งโหลดล่วงหน้า
//    BannerSlider (ฝั่งเบราว์เซอร์) ใช้สร้าง <img>
//    เคยประกาศไว้ใน BannerSlider แล้ว build ฟ้องว่า
//    "Attempted to call half() from the server but half is on the client"
//
// เอารูปปกร้าน (ทรงจัตุรัส 1500×1500) มาผ่าครึ่งด้วย Netlify Image CDN
//   ครึ่งบน  = โลโก้ NEW WAVE + เลื่อยแถวบน
//   ครึ่งล่าง = เลื่อยรุ่นใหญ่ + บาร์ + ใบอนุญาต
// ไม่ได้ตัดไฟล์ทิ้ง ใช้ไฟล์ต้นฉบับใบเดียว อยากปรับตำแหน่งแก้ที่นี่ได้เลย

const HERO = "/img/cover-all.jpg";
export const HERO_W = 1500;       // ความกว้างไฟล์ต้นฉบับ
export const HERO_HALF_H = 750;   // ครึ่งความสูง → แต่ละสไลด์เป็นทรง 2:1

// ความกว้างที่เตรียมไว้ให้เบราว์เซอร์เลือก — ไม่เกิน 1500 เพราะไฟล์ต้นฉบับกว้างเท่านั้น
// ขอใหญ่กว่านี้ = ให้ CDN ขยายรูปจนแตก ได้ไฟล์หนักขึ้นแต่ไม่ได้คมขึ้น
export const HERO_WIDTHS = [640, 750, 828, 1080, 1200, 1500];

// ต้องตรงกับความกว้างจริงของกรอบเนื้อหา (ดู SHELL_W ใน lib/layout.ts) หักขอบซ้ายขวาอย่างละ 12px
//   มือถือ  เต็มความกว้างจอ · ≥640px กรอบ 768px → รูป 744px · ≥1024px กรอบ 1152px → รูป 1128px
// ⚠️ ใส่เลขผิดแล้วเบราว์เซอร์จะโหลดรูปเล็กเกินไปมายืด ภาพจะแตกบนคอม
export const HERO_SIZES = "(max-width: 536px) 100vw, (max-width: 1023px) 744px, 1128px";

/** URL รูปครึ่งบน/ครึ่งล่าง ผ่าน Netlify Image CDN */
export function heroHalf(w: number, position: "top" | "bottom") {
  const p = new URLSearchParams({
    url: HERO,
    w: String(w),
    h: String(Math.round((w * HERO_HALF_H) / HERO_W)),
    fit: "cover",
    position,
    q: "60",   // รูปถ่ายฉากร้าน ลดคุณภาพลงหน่อยตาเปล่าดูไม่ออก แต่ไฟล์เบาลงราวหนึ่งในสาม
  });
  return `/.netlify/images?${p}`;
}

/** srcset ของสไลด์ใบหนึ่ง — ใช้ทั้งใน <img> และในแท็กสั่งโหลดล่วงหน้า ต้องตรงกันเป๊ะ */
export const heroSrcSet = (position: "top" | "bottom") =>
  HERO_WIDTHS.map((w) => `${heroHalf(w, position)} ${w}w`).join(", ");
