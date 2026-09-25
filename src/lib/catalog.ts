// เข้าถึงข้อมูลสินค้า — ใช้ได้เฉพาะฝั่ง server (Server Component / generateStaticParams)
// ห้าม import จาก client component เด็ดขาด ไม่งั้น JSON 4MB จะติดไปกับ bundle
import raw from "@/data/products.json";
import cols from "@/data/collections.json";
import soldMap from "@/data/sold.json";
import type { Product, Collection } from "./types";
import { reviewSummary } from "./reviews";
import { toLocal } from "./local-images";
import { licensedStock } from "./licensed-stock";

// ยอดขายจริงรวมทุกช่องทาง (Shopee/Lazada/TikTok/หน้าร้าน) — เจ้าของร้านกรอกเองที่
// src/data/sold.json รูปแบบ { "<handle ของสินค้า>": 22300 }
// ไฟล์นี้ว่างอยู่ = การ์ดไม่โชว์บรรทัด "ขายได้" (ห้ามใส่ตัวเลขมั่ว)
const sold = soldMap as Record<string, number>;

// ผูกสรุปรีวิวเข้ากับสินค้าตั้งแต่ตอนโหลด การ์ดสินค้าจะได้โชว์ดาวโดยไม่ต้องส่ง prop เพิ่ม
export const products = (raw as unknown as Product[]).map((p) => {
  const rv = reviewSummary(p.h);
  const n = sold[p.h];
  // สลับรูปมาใช้ของที่เก็บเอง (ถ้ามี) — ไม่ต้องพึ่ง Shopify CDN
  const out: Product = {
    ...p,
    img: toLocal(p.img),
    imgs: p.imgs.map((u) => toLocal(u) as string),
    /* ของที่อยู่ในทะเบียนใบอนุญาต — ทับสต็อก **รายตัวเลือก** ด้วย
       🔴 ที่มา 25 ก.ย. 2569: ทับแต่ระดับสินค้าแล้วยังไม่พอ — ปุ่มเลือกขนาดบนหน้าสินค้า
          ตัดสินจาก `v.s <= 0` (`VariantSheet.tsx:138`) ซึ่งเป็นค่าที่แช่ตอน build
          ⇒ บาร์ทุกขนาดยกเว้น 11.8″ ขึ้น **ขีดฆ่า กดไม่ได้** ทั้งที่ /api/stock ตอบถูกแล้ว
          (ท่านประธานถ่ายจอมาให้ดู — ถ้าไม่มีคนเปิดหน้าจริงก็จะไม่มีใครรู้)
       🔑 บทเรียน: เส้นสต็อกสดมีผล **หลังจากเลือกขนาดแล้ว** เท่านั้น ส่วนตัวเลือกจะถูก
          ปิดตั้งแต่ก่อนเลือก ⇒ แก้ API อย่างเดียวไม่มีทางพอ */
    v: p.v.map((v) => {
      const out2 = v.i ? { ...v, i: toLocal(v.i) } : { ...v };
      const ล = licensedStock(v.k);
      if (ล !== null) out2.s = ล;
      return out2;
    }),
  };
  // ระดับสินค้า — `sellable()` กับป้าย "สินค้าหมด" บนการ์ดอ่านจาก `st` ตอน build
  // ไม่ได้รอ /api/stock (การ์ดในหน้ารวมไม่ยิงถามสต็อกสดรายใบ)
  const lic = licensedStock(p.sku);
  if (lic !== null) out.st = lic;
  else {
    /* สินค้าที่ตัวมันเองไม่ได้อยู่ในทะเบียน แต่ **ตัวเลือกอยู่** (บาร์ 11.8″ ที่แบกขนาดอื่นไว้)
       ⇒ ระดับสินค้าต้องนับรวมของในทะเบียนด้วย ไม่งั้นการ์ดขึ้น "สินค้าหมด" ทั้งที่มีของ
       ⚠️ ใช้ **ค่ามากสุด** ไม่ใช่ผลรวม — ตัวเลือกที่ขนาดเดียวกันใช้ของกองเดียวกัน บวกกันจะเกินจริง */
    const มากสุด = out.v.reduce((m, v) => (licensedStock(v.k) !== null ? Math.max(m, v.s) : m), 0);
    if (มากสุด > out.st) out.st = มากสุด;
  }
  if (n) out.sold = n;
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
