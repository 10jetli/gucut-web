import VideoFeed from "@/components/VideoFeed";
import { products } from "@/lib/catalog";

export const metadata = { title: "วิดีโอรีวิว | GUCUT" };

export default function VideosPage() {
  return <VideoFeed products={products} />;
}
