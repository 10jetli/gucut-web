// เข้าถึงข้อมูลสินค้า — ใช้ได้เฉพาะฝั่ง server (Server Component / generateStaticParams)
// ห้าม import จาก client component เด็ดขาด ไม่งั้น JSON 4MB จะติดไปกับ bundle
import raw from "@/data/products.json";
import cols from "@/data/collections.json";
import soldMap from "@/data/sold.json";
import type { Product, Collection } from "./types";
import { reviewSummary } from "./reviews";
import { toLocal } from "./local-images";
import { licensedStock } from "./licensed-stock";
import { สต็อกสดของ } from "./live-stock-baked";
import { สถานะของสินค้า, ยังขายได้, สถานะจากค่า, สถานะของตัวเลือก, รวมสถานะ } from "./stock-state";
import type { StockState } from "./stock-state";

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
      if (ล !== null) { out2.s = ล; out2.sKnown = true; return out2; }
      const สด = สต็อกสดของ(v.k);
      if (สด !== null) { out2.s = สด; out2.sKnown = true; return out2; }
      /* ไม่มีในทะเบียน และฟีดสดไม่รู้จัก ⇒ **ไม่รู้** · ค่าที่แช่ไว้ตอน build เชื่อไม่ได้
         (ของจริง 25 ก.ย. 2569: ค่าแช่ทำให้ปุ่มขนาดถูกขีดฆ่าทั้งที่ /api/stock ตอบถูก) */
      out2.sKnown = false;
      return out2;
    }),
  };
  /* ระดับสินค้า — `sellable()` กับป้าย "สินค้าหมด" บนการ์ดอ่านจาก `st` ตอน build
     การ์ดในหน้ารวมไม่ยิงถาม `/api/stock` รายใบ ⇒ ต้องมีของสดมาก่อนแล้วตอน build
     🔑 ลำดับความน่าเชื่อ (เหมือนกับที่ฟีด `/products.json` ใช้ — ห้ามเขียนกติกาใหม่):
        ทะเบียนใบอนุญาต → ฟีดสดจาก ZORT → **ไม่รู้** (ไม่ถอยไปใช้ค่าที่แช่ไว้)
     🔴 จุดต่างจากฟีด: ฟีดถอยไปใช้ `p.st` ที่แช่ไว้ได้ เพราะมันตัดของหมดออกทั้งแถว
        การ์ดตัดทิ้งไม่ได้ ⇒ ค่าที่แช่ไว้ = คำโกหกที่อยู่บนจอ ⇒ ต้องเป็น "ไม่รู้" */
  const lic = licensedStock(p.sku);
  if (lic !== null) {
    /* ทะเบียนใบอนุญาตเป็นของที่เราถือเอกสารอยู่จริง ⇒ ทับทุกชั้น (7 รุ่น 24 เครื่อง) */
    out.st = lic; out.stKnown = true;
  } else {
    /* 🔴 แก้ 2 ต.ค. 2569 18:22 — ของเดิมหยิบ "สต็อกสดของรหัสระดับสินค้า" มาแล้วปิดจบ
          ⇒ `ตะไบ NEWWAVE` ขึ้นป้ายหมดทั้งใบ เพราะ ZORT รู้จักรหัสเดียว (`03409-3` = -8)
            และรหัสนั้นเป็นของ **ตัวเลือกเดียว** ส่วนอีก 5 ตัวเลือก (มีของ 876 ชิ้นตามค่าแช่) ไม่รู้จักเลย
       🔑 ตอนนี้ระดับสินค้า = **รวมสัญญาณทั้งหมด** ผ่าน `รวมสถานะ()` ที่อยู่ใน stock-state ที่เดียว
          ⇒ ตัวเลือกที่ยัง "ไม่รู้" **กันการขึ้นป้ายหมดไว้เสมอ** (ไม่รู้ ห้ามกลายเป็น หมด) */
    const สดระดับสินค้า = สต็อกสดของ(p.sku);
    const สัญญาณ: StockState[] = [];
    if (สดระดับสินค้า !== null) สัญญาณ.push(สถานะจากค่า(สดระดับสินค้า));
    for (const v of out.v) สัญญาณ.push(สถานะของตัวเลือก(v));

    const รวม = รวมสถานะ(สัญญาณ);
    if (รวม === "มีของ") {
      /* ⚠️ ใช้ **ค่ามากสุด** ไม่ใช่ผลรวม — ตัวเลือกขนาดเดียวกันใช้ของกองเดียวกัน บวกกันจะเกินจริง */
      const ที่รู้ = [
        ...(สดระดับสินค้า !== null ? [สดระดับสินค้า] : []),
        ...out.v.filter((v) => v.sKnown).map((v) => v.s),
      ];
      out.st = Math.max(0, ...ที่รู้); out.stKnown = true;
    } else if (รวม === "หมดจริง") {
      out.st = 0; out.stKnown = true;
    } else {
      /* ไม่รู้ — ห้ามถอยไปใช้ `p.st` ที่แช่ไว้เป็นพื้น นั่นคือตัวเลขที่พาเรามาที่นี่ */
      out.stKnown = false;
    }
  }
  if (n) out.sold = n;
  return rv ? { ...out, rv } : out;
});
export const collections = cols as unknown as Collection[];

const byHandle = new Map(products.map((p) => [p.h, p]));
export const getProduct = (h: string) => byHandle.get(h);

const colByHandle = new Map(collections.map((c) => [c.h, c]));
export const getCollection = (h: string) => colByHandle.get(h);

/* สินค้าที่พร้อมโชว์จริง — มีรูป + **ไม่ใช่ของที่หมดจริง**
   🔴 ของเดิมเขียน `p.st > 0` ⇒ ของที่ "ยังไม่รู้สต็อก" ถูก **ซ่อนหายจากหน้ารวมทั้งตัว**
      ไม่ใช่แค่ขึ้นป้ายหมด ⇒ เสียยอดขายหนักกว่าป้ายผิด (ลูกค้าไม่เห็นของเลย)
      (2 ต.ค. 2569: การ์ด 232 ใบอยู่ในสภาพนี้ · 227 ใบไม่มีช่อง sku จึงไม่มีทางรู้ตลอดกาล)
   ⇒ `ไม่รู้` ให้โชว์และกดซื้อได้ · มีแต่ `หมดจริง` ที่ถูกตัดออก */
export const sellable = (p: Product) => !!p.img && ยังขายได้(สถานะของสินค้า(p));

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
