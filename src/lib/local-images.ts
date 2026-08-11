// สลับ URL รูปจาก Shopify CDN มาเป็นไฟล์ที่เราเก็บไว้เอง (/img/...)
// ทำตอน build ฝั่ง server เท่านั้น — ใช้บัญชีจาก scripts/gen-image-manifest.mjs
// รูปที่ยังไม่ได้เก็บ ปล่อยชี้ Shopify ต่อไป (เว็บไม่พังระหว่างทยอยเก็บ)
import archived from "@/data/image-map.json";

const have = new Set(archived as string[]);

/** ชื่อไฟล์ที่ใช้เก็บ: ตัด query แล้วบังคับนามสกุล .webp (Image CDN คืน WebP) */
export function localName(url: string): string | null {
  if (!url.includes("cdn.shopify.com")) return null;
  const base = url.split("?")[0].split("/").pop();
  if (!base) return null;
  return base.replace(/\.(jpe?g|png|webp|avif|gif)$/i, "") + ".webp";
}

/** คืน /img/xxx.webp ถ้าเก็บไว้แล้ว ไม่งั้นคืน URL เดิม */
export function toLocal(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  const n = localName(url);
  return n && have.has(n) ? `/img/${n}` : url;
}

export const archivedCount = have.size;
