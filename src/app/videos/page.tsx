import type { Viewport } from "next";
import { titleSuffix } from "@/lib/shop";
import VideoFeed from "@/components/VideoFeed";
import { feedItems, FIRST_PAGE } from "@/lib/feed";
import { VIDEO_HOST, VIDEO_PREFIX } from "@/lib/videos";

// preload คลิปกี่ใบล่วงหน้าตั้งแต่ตอนอ่าน HTML — คลิปแรกที่ browser สุ่มจะเป็นหนึ่งในนี้
// จึงถูกโหลดไว้ก่อนเสมอ ไม่ต้องรอ JavaScript = เปิดมาเล่นไว (แต่ยังสุ่ม)
const WARM = 3;

export const metadata = { title: titleSuffix("วิดีโอรีวิว") };

// ---------------------------------------------------------------------------
// ⚠️ หน้านี้หน้าเดียวที่ล็อกไม่ให้ซูมจอ — หน้าอื่นทั้งเว็บซูมได้ตามปกติ
//
// อาการที่เจอจริง 18 ส.ค. 2569 (เจ้าของร้านส่งภาพมายืนยัน)
//   พอเผลอบีบสองนิ้วซูมเข้า แถวปุ่มหัวใจ/คอมเมนต์/แชร์ ที่อยู่ริมขวา
//   กับแผ่นคอมเมนต์ที่เลื่อนขึ้นมา จะเลยขอบจอออกไป กดไม่ได้เลย
//   ลูกค้าจะนึกว่าเว็บพัง ทั้งที่ระบบทำงานปกติ
//
// ทำไมถึงเป็น: ของที่ปักตำแหน่งแบบ fixed ยึดกับ "กรอบหน้าเว็บ" ไม่ใช่ "สิ่งที่ตาเห็น"
// พอซูมเข้า กรอบหน้าเว็บใหญ่กว่าจอ ของพวกนั้นจึงไปอยู่นอกสายตา
// เป็นข้อกำหนดของเบราว์เซอร์เอง แก้ด้วย CSS ไม่ได้
//
// ทำไมล็อกเฉพาะหน้านี้ได้โดยไม่เสียเรื่องการเข้าถึง
//   หน้านี้เป็นจอเต็มแบบแอปดูคลิป ไม่มีตัวหนังสือเล็ก ๆ ให้ต้องขยายอ่าน
//   ส่วนหน้าที่ลูกค้าต้องขยายจริง (สินค้า · สเปก · รหัสอะไหล่ · ตะกร้า · บทความ)
//   ยังซูมได้เหมือนเดิมทุกหน้า
//
// ⚠️ ห้ามเอาการล็อกซูมนี้ไปใส่ที่ layout.tsx (ซึ่งใช้กับทั้งเว็บ)
//    เคยใส่ไว้ตรงนั้นแล้วโดน Lighthouse หักคะแนนหนักที่สุด (น้ำหนัก 10)
//    และคนสายตาไม่ดีขยายดูสเปกสินค้าไม่ได้เลย
// ---------------------------------------------------------------------------
export const viewport: Viewport = {
  themeColor: "#333333",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function VideosPage() {
  // ฝังไปกับหน้าเว็บแค่ชุดแรก ที่เหลือฟีดไปดึงเองจาก /feed.json ตอนลูกค้าเลื่อนใกล้หมด
  // ⚠️ เว็บ build เป็น HTML นิ่ง (output: export) จึงสุ่มตอน build ไม่ได้ (ทุกคนได้ใบเดิม)
  //    การสุ่มจริงจึงย้ายไปทำฝั่งเบราว์เซอร์ใน VideoFeed แทน — เปิดกี่ครั้งได้คลิปแรกคนละใบ
  const items = feedItems();

  // preload ไฟล์ของคลิป WARM ใบแรกไว้ตั้งแต่ HTML — VideoFeed จะสุ่มคลิปแรกจากในนี้เท่านั้น
  // จึงเจอ warm cache เสมอ เปิดมาเล่นไวโดยไม่เสียการสุ่ม (ต่างจากปักใบเดียวที่ซ้ำทุกครั้ง)
  const warm = VIDEO_HOST
    ? items.slice(0, WARM).flatMap((it) => [
        `${VIDEO_HOST}${VIDEO_PREFIX}/${it.v.v}/master.m3u8`,
        `${VIDEO_HOST}${VIDEO_PREFIX}/${it.v.v}/v480/index.m3u8`,
        `${VIDEO_HOST}${VIDEO_PREFIX}/${it.v.v}/v480/seg000.ts`,
      ])
    : [];

  return (
    <>
      {VIDEO_HOST && <link rel="preconnect" href={VIDEO_HOST} crossOrigin="anonymous" />}
      {warm.map((u) => (
        <link key={u} rel="preload" as="fetch" href={u} crossOrigin="anonymous" />
      ))}
      <VideoFeed first={items.slice(0, FIRST_PAGE)} total={items.length} warm={WARM} />
    </>
  );
}
