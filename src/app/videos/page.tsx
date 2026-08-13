import VideoFeed from "@/components/VideoFeed";
import { feedItems, FIRST_PAGE } from "@/lib/feed";

export const metadata = { title: "วิดีโอรีวิว | GUCUT" };

export default function VideosPage() {
  // ฝังไปกับหน้าเว็บแค่ชุดแรก ที่เหลือฟีดไปดึงเองจาก /feed.json ตอนเลื่อนใกล้หมด
  const items = feedItems();
  return <VideoFeed first={items.slice(0, FIRST_PAGE)} total={items.length} />;
}
