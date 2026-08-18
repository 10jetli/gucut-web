import type { Viewport } from "next";
import { titleSuffix } from "@/lib/shop";
import VideoFeed from "@/components/VideoFeed";
import { feedItems, FIRST_PAGE } from "@/lib/feed";
import { VIDEO_HOST, VIDEO_PREFIX } from "@/lib/videos";

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
  const items = feedItems();
  const first = items[0]?.v.v;

  // สั่งโหลดไฟล์ของคลิปใบแรกตั้งแต่ตอนเบราว์เซอร์ยังอ่าน HTML อยู่
  // ไม่ต้องรอ JavaScript โหลดเสร็จก่อนถึงจะเริ่มขอคลิป — ประหยัดได้เป็นวินาทีบนมือถือ
  // (ฟีดปักใบแรกไว้ที่เดิมเสมอตอนสลับลำดับ ใบนี้จึงเป็นใบที่ลูกค้าเห็นแน่นอน)
  const warm = first && VIDEO_HOST
    ? [
        `${VIDEO_HOST}${VIDEO_PREFIX}/${first}/master.m3u8`,
        `${VIDEO_HOST}${VIDEO_PREFIX}/${first}/v480/index.m3u8`,
        `${VIDEO_HOST}${VIDEO_PREFIX}/${first}/v480/seg000.ts`,
      ]
    : [];

  return (
    <>
      {warm.map((u) => (
        <link key={u} rel="preload" as="fetch" href={u} crossOrigin="anonymous" />
      ))}
      <VideoFeed first={items.slice(0, FIRST_PAGE)} total={items.length} />
    </>
  );
}
