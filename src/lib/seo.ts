// ข้อมูลโครงสร้าง (JSON-LD) สำหรับ SEO / AEO / GEO — ใช้ได้เฉพาะฝั่ง server
//
// SEO = ให้ Google จัดอันดับ · AEO = ให้ถูกหยิบไปตอบในกล่องคำตอบ
// GEO = ให้ AI (ChatGPT / Gemini / Perplexity) อ้างถึงร้านเราเวลามีคนถาม
//
// ทั้งสามอย่างกินข้อมูลชุดเดียวกัน: บอกให้ชัดว่า "นี่คือใคร ขายอะไร ราคาเท่าไหร่
// มีของไหม ใครรีวิวว่ายังไง" ในรูปแบบที่เครื่องอ่านออก ไม่ใช่แค่ตัวหนังสือสวย ๆ
import { SHOP } from "./shop";
import { SITE_URL as SITE } from "./site";

export const abs = (path: string) => `${SITE}${path.startsWith("/") ? path : `/${path}`}`;

/** ร้านคือใคร — ตัวนี้สำคัญที่สุดสำหรับ GEO เพราะ AI ใช้ตอบว่า "ร้านนี้คือร้านอะไร" */
export const organizationLd = () => ({
  "@context": "https://schema.org",
  "@type": "Store",
  "@id": abs("/#store"),
  name: "GUCUT",
  alternateName: ["กูคัท", "GUCUT เลื่อยยนต์"],
  url: SITE,
  description:
    "ร้าน GUCUT ขายเลื่อยยนต์ NEWWAVE และ KingKong ของแท้ พร้อมโซ่ บาร์ และอะไหล่ครบทุกรุ่น " +
    "ส่งฟรีทั่วไทย เก็บเงินปลายทางได้ มีอะไหล่แยกชิ้นกว่า 2,400 รายการ",
  image: abs("/img/cover-all.jpg"),
  logo: abs("/icon-512.png"),
  priceRange: "฿฿",
  currenciesAccepted: "THB",
  paymentAccepted: "เงินสด, เก็บเงินปลายทาง, โอนผ่าน QR พร้อมเพย์",
  areaServed: { "@type": "Country", name: "ประเทศไทย" },
  // ช่องทางอื่นของร้าน — ช่วยให้ AI เชื่อมได้ว่าร้านบนเว็บ ร้านบน YouTube
  // และร้านบนมาร์เก็ตเพลส คือร้านเดียวกัน (สำคัญกับ LLMO เรื่อง "ตัวตนของแบรนด์")
  sameAs: ["https://www.youtube.com/@NEWWAVELegends"],
  // บอกว่ามีไฟล์ข้อมูลแบบเครื่องอ่านให้ใช้ ไม่ต้องไล่อ่านทีละหน้า
  subjectOf: {
    "@type": "DataFeed",
    name: "รายการสินค้าทั้งหมดของ GUCUT",
    url: abs("/products.json"),
    encodingFormat: "application/json",
  },
  ...(SHOP.legalName ? { legalName: SHOP.legalName } : {}),
  ...(SHOP.taxId ? { taxID: SHOP.taxId } : {}),
  ...(SHOP.phone ? { telephone: SHOP.phone } : {}),
  ...(SHOP.email ? { email: SHOP.email } : {}),
  ...(SHOP.address ? { address: { "@type": "PostalAddress", streetAddress: SHOP.address, addressCountry: "TH" } } : {}),
});

/** เว็บไซต์ + ช่องค้นหา (Google เอาไปทำช่องค้นในผลค้นหา) */
export const websiteLd = () => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": abs("/#website"),
  url: SITE,
  name: "GUCUT",
  inLanguage: "th-TH",
  publisher: { "@id": abs("/#store") },
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: abs("/search?q={search_term_string}") },
    "query-input": "required name=search_term_string",
  },
});

/** เส้นทางหน้า — ช่วยให้ผลค้นหาโชว์เส้นทางแทน URL ยาว ๆ */
export const breadcrumbLd = (trail: { name: string; url: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((x, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: x.name,
    item: abs(x.url),
  })),
});

/** คลิปวิดีโอ — AI กับ Google ใช้ตัวนี้หยิบคลิปไปโชว์ */
export const videoLd = (v: {
  id: string; name: string; description: string; thumb: string; dur: number; url: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: v.name,
  description: v.description,
  thumbnailUrl: v.thumb,
  duration: `PT${Math.floor(v.dur / 60)}M${v.dur % 60}S`,
  contentUrl: v.url,
  uploadDate: "2026-08-15",
  publisher: { "@id": abs("/#store") },
});

/** คำถาม-คำตอบ — ตัวนี้แหละที่ทำให้ถูกหยิบไปตอบ (AEO) */
export const faqLd = (qa: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: qa.map((x) => ({
    "@type": "Question",
    name: x.q,
    acceptedAnswer: { "@type": "Answer", text: x.a },
  })),
});

/** รายการสินค้าในหมวด */
export const itemListLd = (items: { h: string; t: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "ItemList",
  numberOfItems: items.length,
  itemListElement: items.slice(0, 30).map((p, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: abs(`/products/${encodeURIComponent(p.h)}/`),
    name: p.t,
  })),
});

/** ใส่ JSON-LD ลงหน้า — เรียกจาก server component เท่านั้น */
export const ldScript = (data: unknown) => ({
  __html: JSON.stringify(data),
});
