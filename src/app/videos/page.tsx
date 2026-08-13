import VideoFeed from "@/components/VideoFeed";
import { getProduct } from "@/lib/catalog";
import { videos, type FeedItem } from "@/lib/videos";

export const metadata = { title: "วิดีโอรีวิว | GUCUT" };

export default function VideosPage() {
  // ผูกคลิปกับสินค้าตั้งแต่ฝั่ง server แล้วส่งเฉพาะข้อมูลที่ฟีดใช้จริง
  // (เดิมส่ง products ทั้งก้อนไปให้ client — แคตตาล็อก 4MB ติดไปกับหน้าเว็บ)
  const items: FeedItem[] = videos.map((v) => {
    const p = v.h ? getProduct(v.h) : undefined;
    return p ? { v, p: { h: p.h, t: p.t, img: p.img, p: p.p } } : { v };
  });

  return <VideoFeed items={items} />;
}
