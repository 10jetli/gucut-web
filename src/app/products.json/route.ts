// ฟีดสินค้าแบบเครื่องอ่าน — /products.json
//
// ทำเพื่อ LLMO โดยเฉพาะ: ผู้ช่วย AI ไล่อ่านหน้าเว็บ 2,482 หน้าไม่ไหว
// แต่ถ้ามีไฟล์เดียวที่บอกครบว่ามีสินค้าอะไร ราคาเท่าไหร่ ของมีไหม
// มันจะหยิบไปตอบได้ถูกและครบกว่ามาก และเราคุมได้ว่าจะให้มันเห็นอะไร
//
// ใช้กับงานอื่นได้อีก: ทำฟีดเข้า Google Merchant / Facebook Catalog
import { products, sellable } from "@/lib/catalog";
import { SITE_URL as SITE } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const list = products.filter(sellable).map((p) => ({
    sku: p.sku || undefined,
    name: p.t,
    url: `${SITE}/products/${encodeURIComponent(p.h)}/`,
    price: p.p,
    priceMax: p.pmax > p.p ? p.pmax : undefined,
    currency: "THB",
    inStock: p.st > 0,
    image: p.img ? `${SITE}${p.img}` : undefined,
    brand: /KINGKONG|KING KONG/i.test(p.t) ? "KINGKONG" : /NEWWAVE/i.test(p.t) ? "NEWWAVE" : "GUCUT",
    rating: p.rv ? { value: p.rv.a, count: p.rv.n } : undefined,
    options: p.v.length > 1 ? p.v.map((v) => v.t).slice(0, 40) : undefined,
  }));

  return Response.json({
    store: "GUCUT",
    about: "เลื่อยยนต์ NEWWAVE / KingKong ของแท้ โซ่ บาร์ และอะไหล่แยกชิ้น ส่งทั่วไทย",
    site: SITE,
    currency: "THB",
    count: list.length,
    products: list,
  });
}
