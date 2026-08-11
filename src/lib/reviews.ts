// รีวิวจริงจากลูกค้าที่ซื้อสินค้าไปแล้ว รวมมาจากทุกช่องทางขายของร้าน
// ใช้ได้เฉพาะฝั่ง server เหมือน catalog.ts (ห้าม import จาก client component)
import data from "@/data/reviews.json";
import rvImg from "@/data/review-image-map.json";
import type { Review, ReviewSummary } from "./types";

interface Entry {
  avg: number;
  count: number;
  items: Review[];
}

// กันชื่อร้านค้าออนไลน์เจ้าอื่นหลุดออกหน้าเว็บ (ต้องตรงกับ scripts/gen-reviews.mjs)
const PLATFORM = /shopee|lazada|tiktok|tik ?tok|ช้อปปี้|ช็อปปี้|ลาซาด้า|ติ๊กต๊อก|ติกต็อก|ทิกทอก/i;

// รูปรีวิวที่เก็บมาไว้เองแล้ว → ชี้มาที่เว็บเรา (ที่เหลือชี้ต้นทางเดิมไปก่อน)
const imgMap = rvImg as Record<string, string>;
const localImg = (u: string) => imgMap[(u || "").split("?")[0]] ?? u;

const raw = Object.fromEntries(
  Object.entries(data as unknown as Record<string, Entry>).map(([h, e]) => [
    h,
    {
      ...e,
      items: e.items
        .filter((r) => !PLATFORM.test(r.text || ""))
        .map((r) => ({ ...r, images: (r.images || []).map(localImg) })),
    },
  ])
) as Record<string, Entry>;

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
