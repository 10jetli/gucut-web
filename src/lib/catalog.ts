// เข้าถึงข้อมูลสินค้า — ใช้ได้เฉพาะฝั่ง server (Server Component / generateStaticParams)
// ห้าม import จาก client component เด็ดขาด ไม่งั้น JSON 4MB จะติดไปกับ bundle
import raw from "@/data/products.json";
import cols from "@/data/collections.json";
import type { Product, Collection } from "./types";
import { reviewSummary } from "./reviews";
import { toLocal } from "./local-images";

// ผูกสรุปรีวิวเข้ากับสินค้าตั้งแต่ตอนโหลด การ์ดสินค้าจะได้โชว์ดาวโดยไม่ต้องส่ง prop เพิ่ม
export const products = (raw as unknown as Product[]).map((p) => {
  const rv = reviewSummary(p.h);
  // สลับรูปมาใช้ของที่เก็บเอง (ถ้ามี) — ไม่ต้องพึ่ง Shopify CDN
  const out: Product = {
    ...p,
    img: toLocal(p.img),
    imgs: p.imgs.map((u) => toLocal(u) as string),
    v: p.v.map((v) => (v.i ? { ...v, i: toLocal(v.i) } : v)),
  };
  return rv ? { ...out, rv } : out;
});
export const collections = cols as unknown as Collection[];

const byHandle = new Map(products.map((p) => [p.h, p]));
export const getProduct = (h: string) => byHandle.get(h);

const colByHandle = new Map(collections.map((c) => [c.h, c]));
export const getCollection = (h: string) => colByHandle.get(h);

// สินค้าที่พร้อมโชว์จริง — มีรูป + มีสต็อก
export const sellable = (p: Product) => !!p.img && p.st > 0;

export function inCollection(handle: string) {
  return products.filter((p) => p.cols.includes(handle));
}

// จัดกลุ่มเมนูตามโครง Shopify
export function menuGroups() {
  const top = collections.filter((c) => !c.g);
  const groups = new Map<string, Collection[]>();
  for (const c of collections) {
    if (!c.g) continue;
    if (!groups.has(c.g)) groups.set(c.g, []);
    groups.get(c.g)!.push(c);
  }
  return { top, groups };
}

// ขายดี = สต็อกเยอะ + มีรูป (ใช้แทนตัวเลขยอดขายปลอม)
export function bestSellers(n = 20) {
  return products.filter(sellable).slice(0, n);
}

export function flashSale(n = 10) {
  const withDiscount = products.filter((p) => sellable(p) && p.c && p.c > p.p);
  return (withDiscount.length >= 4 ? withDiscount : products.filter(sellable)).slice(0, n);
}
