// ข้อมูลโครงสร้าง (JSON-LD) สำหรับ SEO / AEO / GEO — ใช้ได้เฉพาะฝั่ง server
//
// SEO = ให้ Google จัดอันดับ · AEO = ให้ถูกหยิบไปตอบในกล่องคำตอบ
// GEO = ให้ AI (ChatGPT / Gemini / Perplexity) อ้างถึงร้านเราเวลามีคนถาม
//
// ทั้งสามอย่างกินข้อมูลชุดเดียวกัน: บอกให้ชัดว่า "นี่คือใคร ขายอะไร ราคาเท่าไหร่
// มีของไหม ใครรีวิวว่ายังไง" ในรูปแบบที่เครื่องอ่านออก ไม่ใช่แค่ตัวหนังสือสวย ๆ
import { activeLicenses, activeTrademarks, DISTRIBUTORSHIPS, LICENSEE, TRADEMARK_AUTHORITY } from "./licenses";
import { SHOP } from "./shop";
import { BRAND } from "./shop";
import { SITE_URL as SITE } from "./site";

export const abs = (path: string) => `${SITE}${path.startsWith("/") ? path : `/${path}`}`;

/** ร้านคือใคร — ตัวนี้สำคัญที่สุดสำหรับ GEO เพราะ AI ใช้ตอบว่า "ร้านนี้คือร้านอะไร" */
export const organizationLd = () => ({
  "@context": "https://schema.org",
  "@type": "Store",
  "@id": abs("/#store"),
  name: BRAND.name,
  alternateName: BRAND.aka,
  url: SITE,
  description:
    `ร้าน ${BRAND.name} ขายเลื่อยยนต์ NEWWAVE และ KingKong ของแท้ พร้อมโซ่ บาร์ และอะไหล่ครบทุกรุ่น ` +
    "ส่งทั่วไทยด้วย Flash Express เก็บเงินปลายทางได้ มีอะไหล่แยกชิ้นกว่า 2,400 รายการ",
  image: abs("/img/cover-all.jpg"),
  logo: abs("/icon-512.png"),
  priceRange: "฿฿",
  currenciesAccepted: "THB",
  paymentAccepted: "เงินสด, เก็บเงินปลายทาง, โอนผ่าน QR พร้อมเพย์",
  areaServed: { "@type": "Country", name: "ประเทศไทย" },
  // ช่องทางอื่นของร้าน — ช่วยให้ AI เชื่อมได้ว่าร้านบนเว็บ ร้านบน YouTube
  // และร้านบนมาร์เก็ตเพลส คือร้านเดียวกัน (สำคัญกับ LLMO เรื่อง "ตัวตนของแบรนด์")
  sameAs: ["https://www.youtube.com/@NEWWAVELegends", SHOP.lineUrl],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer service",
      url: SHOP.lineUrl,
      name: `LINE Official Account ${SHOP.lineOa}`,
      availableLanguage: "th",
    },
  ],
  // บอกว่ามีไฟล์ข้อมูลแบบเครื่องอ่านให้ใช้ ไม่ต้องไล่อ่านทีละหน้า
  subjectOf: {
    "@type": "DataFeed",
    name: `รายการสินค้าทั้งหมดของ ${BRAND.name}`,
    url: abs("/products.json"),
    encodingFormat: "application/json",
  },
  // ใบอนุญาตเลื่อยโซ่ยนต์ — เครื่องอ่านได้ แต่ไม่แสดงบนหน้าจอ
  //
  // ⚠️ นี่ไม่ใช่การซ่อนข้อความหลอกเครื่องมือค้นหา (cloaking)
  //    ข้อมูลชุดนี้ส่งให้ทุกคนเหมือนกัน ไม่ได้แยกตามว่าใครเป็นคนขอ
  //    และมีหน้าจริงที่เปิดดูได้ที่ /policy/license/ พร้อมลิงก์ตรวจสอบกับกรมป่าไม้
  //    ถ้าวันหนึ่งจะเปลี่ยนไปส่งข้อความต่างกันให้บอตกับคน = ผิดกติกา Google
  //    และเสี่ยงทั้งโดเมนอายุ 14 ปีพร้อมอันดับทั้งหมด — ห้ามทำเด็ดขาด
  //
  // ⚠️ ส่งเฉพาะใบที่ยังใช้ได้จริง คิดจากวันที่ทุกครั้งที่ build
  //    ใบหมดอายุแล้วยังส่งให้เครื่องอ่าน = ป้อนข้อมูลผิดให้ AI เอาไปตอบลูกค้า
  // ⚠️ ใบอนุญาตเลื่อยโซ่ยนต์เป็นของ **ผู้ผลิต** ไม่ใช่ของร้าน
  //    ร้าน (SHOP) เป็นตัวแทนจำหน่ายที่ได้รับแต่งตั้ง จึงผูกใบอนุญาตไว้กับ manufacturer
  //    ไม่ใช่ hasCredential ของร้าน — อ้างใบอนุญาตของนิติบุคคลอื่นว่าเป็นของตัวเองคืออ้างเกินจริง
  //    สิ่งที่เป็นของร้านจริง ๆ คือ "หนังสือแต่งตั้งตัวแทนจำหน่าย" ซึ่งอยู่ใน hasCredential ด้านล่าง
  ...(DISTRIBUTORSHIPS.length
    ? {
        hasCredential: DISTRIBUTORSHIPS.map((d) => ({
          "@type": "EducationalOccupationalCredential",
          credentialCategory: "หนังสือแต่งตั้งตัวแทนจำหน่าย",
          name: `${d.scope} (${d.brand})`,
          datePublished: d.issued,
          recognizedBy: { "@type": "Organization", name: d.appointer },
        })),
      }
    : {}),
  ...(activeLicenses().length
    ? {
        knowsAbout:
          `สินค้าที่จำหน่ายผลิตและนำเข้าโดย ${LICENSEE.name} ซึ่งได้รับใบอนุญาตตามพระราชบัญญัติเลื่อยโซ่ยนต์ พ.ศ. 2545`,
      }
    : {}),
  // เครื่องหมายการค้าที่จดทะเบียนไว้ — ตอบคำถาม "ของแท้ไหม" ให้เครื่องอ่าน
  //
  // ⚠️ ใส่เลขทะเบียนลงไปด้วยเสมอ ไม่ใช่แค่ชื่อแบรนด์
  //    ชื่อแบรนด์เฉย ๆ ใครก็เขียนได้ เลขทะเบียนคือสิ่งที่เอาไปตรวจกับกรมทรัพย์สินทางปัญญาได้
  // ⚠️ ส่งเฉพาะเครื่องหมายที่ยังอยู่ในอายุคุ้มครอง คิดจากวันที่ทุกครั้งที่ build
  ...(activeTrademarks().length
    ? {
        brand: activeTrademarks().map((t) => ({
          "@type": "Brand",
          name: t.mark,
          identifier: [
            {
              "@type": "PropertyValue",
              propertyID: "ทะเบียนเครื่องหมายการค้า (ประเทศไทย)",
              value: t.regNo,
            },
          ],
          owner: { "@type": "Organization", name: t.owner },
        })),
        makesOffer: {
          "@type": "Offer",
          itemOffered: {
            "@type": "Product",
            name: `เลื่อยโซ่ยนต์และอะไหล่ ${activeTrademarks().map((t) => t.mark).join(" / ")}`,
            manufacturer: {
              "@type": "Organization",
              name: LICENSEE.name,
              taxID: LICENSEE.taxId,
              hasCredential: activeLicenses().map((l) => ({
                "@type": "EducationalOccupationalCredential",
                credentialCategory: "license",
                name: l.kind,
                identifier: l.no,
                datePublished: l.issued,
                recognizedBy: { "@type": "GovernmentOrganization", name: l.authority },
              })),
            },
          },
          seller: { "@type": "Organization", name: BRAND.name },
          areaServed: { "@type": "Country", name: "ประเทศไทย" },
          description:
            `จำหน่ายโดยตัวแทนจำหน่ายที่ได้รับแต่งตั้งจากเจ้าของเครื่องหมายการค้าโดยตรง จดทะเบียนไว้กับ${TRADEMARK_AUTHORITY}`,
        },
      }
    : {}),
  ...(SHOP.legalName ? { legalName: SHOP.legalName } : {}),
  ...(SHOP.legalNameEn ? { alternateName: SHOP.legalNameEn } : {}),
  ...(SHOP.taxId ? { taxID: SHOP.taxId } : {}),
  ...(SHOP.phone ? { telephone: SHOP.phone } : {}),
  ...(SHOP.email ? { email: SHOP.email } : {}),
  // ⚠️ ไม่ส่งที่อยู่ออกไป — เจ้าของร้านสั่งไว้ 24 ส.ค. 2569 ว่าไม่อยากให้ที่อยู่เป็นสาธารณะ
  //    (Shopee/Lazada ก็ไม่โชว์ที่อยู่ผู้ขาย) · ที่อยู่ไม่มีอยู่ในโค้ดแล้ว — ดูเหตุผลใน shop.ts
  //    ส่งประเทศอย่างเดียวพอ ให้ Google/AI รู้ว่าร้านอยู่ไทย
  address: { "@type": "PostalAddress", addressCountry: "TH" },
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
