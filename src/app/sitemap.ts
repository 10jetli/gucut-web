import type { MetadataRoute } from "next";
import { products, collections } from "@/lib/catalog";

// sitemap สำหรับ 2,482 หน้าสินค้า + 30 หมวด
// พร้อมใช้ทันทีที่ย้ายไป gucut.com — แค่เปลี่ยน NEXT_PUBLIC_SITE_URL
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://new78.com";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date("2026-08-10");

  const staticPages = ["", "/categories", "/videos"].map((p) => ({
    url: `${BASE}${p}/`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.7,
  }));

  // หน้าเอกสารของร้าน — เปลี่ยนแปลงน้อย แต่ต้องให้ Google เห็น
  // (Meta/Google ตรวจว่าเข้าถึงได้จริงก่อนอนุมัติปุ่มเข้าสู่ระบบ)
  const policyPages = ["/policy/privacy", "/policy/terms"].map((p) => ({
    url: `${BASE}${p}/`,
    lastModified: now,
    changeFrequency: "yearly" as const,
    priority: 0.3,
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

  return [...staticPages, ...policyPages, ...collectionPages, ...productPages, ...reviewPages];
}
