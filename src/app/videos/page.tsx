import VideoFeed from "@/components/VideoFeed";
import { feedItems, FIRST_PAGE } from "@/lib/feed";
import { VIDEO_HOST, VIDEO_PREFIX } from "@/lib/videos";

export const metadata = { title: "วิดีโอรีวิว | GUCUT" };

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
