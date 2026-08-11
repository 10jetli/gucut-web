// รีวิวจริงจาก Shopee / Lazada / TikTok — ดึงมาจาก metafield mp_reviews.* บน Shopify
// ใช้ได้เฉพาะฝั่ง server เหมือน catalog.ts (ห้าม import จาก client component)
import data from "@/data/reviews.json";
import type { Review, ReviewSummary } from "./types";

interface Entry {
  avg: number;
  count: number;
  items: Review[];
}

const raw = data as unknown as Record<string, Entry>;

// สรุปรีวิว (ดาว + จำนวน) — ใช้บนการ์ดสินค้าและหัวหน้าสินค้า
export function reviewSummary(handle: string): ReviewSummary | undefined {
  const e = raw[handle];
  return e ? { a: e.avg, n: e.count } : undefined;
}

// การ์ดรีวิวที่เอามาแสดง — เรียงให้อันที่มีรูป+มีข้อความขึ้นก่อน
export function reviewItems(handle: string): Review[] {
  const items = raw[handle]?.items ?? [];
  return [...items].sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date));
}

function score(r: Review) {
  return (r.video ? 4 : 0) + (r.images.length ? 2 : 0) + (r.text.trim() ? 1 : 0);
}

export const REVIEWED_HANDLES = Object.keys(raw);
