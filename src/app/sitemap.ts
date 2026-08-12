import type { MetadataRoute } from "next";
import { products, collections } from "@/lib/catalog";

// sitemap สำหรับ 2,482 หน้าสินค้า + 30 หมวด
// โดเมนจริงคือ gucut.com — ทับด้วย NEXT_PUBLIC_SITE_URL ได้ถ้าต้องทดสอบบนโดเมนอื่น
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gucut.com";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date("2026-08-10");

  const staticPages = ["", "/categories", "/videos"].map((p) => ({
    url: `${BASE}${p}/`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.7,
  }));

  const collectionPages = collections.map((c) => ({
    url: `${BASE}/c/${encodeURIComponent(c.h)}/`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  // สินค้าที่มีรูป+สต็อก ให้ priority สูงกว่า
  const productPages = products.map((p) => ({
    url: `${BASE}/products/${encodeURIComponent(p.h)}/`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: p.img && p.st > 0 ? 0.7 : 0.3,
  }));

  // หน้ารีวิวทั้งหมด — เนื้อหาจากผู้ซื้อจริง Google ชอบ
  const reviewPages = products
    .filter((p) => p.rv)
    .map((p) => ({
      url: `${BASE}/products/${encodeURIComponent(p.h)}/reviews/`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  return [...staticPages, ...collectionPages, ...productPages, ...reviewPages];
}
