// บทความจากบล็อกเดิม — ดึงมาเก็บไว้ในโปรเจกต์แล้วด้วย scripts/gen-articles.mjs
//
// ⚠️ ใช้ได้เฉพาะฝั่ง server เท่านั้น (ไฟล์ข้อมูล 174KB ห้ามให้ติดไปกับ bundle
//    ที่ส่งให้เบราว์เซอร์ลูกค้า) หน้าไหนจะใช้ต้องเป็น server component
import raw from "@/data/articles.json";

export interface Article {
  h: string;      // handle — ใช้เป็น URL
  t: string;      // ชื่อเรื่อง
  d: string;      // คำโปรย (ใช้เป็น meta description)
  at: string;     // วันที่เผยแพร่ YYYY-MM-DD
  blog: string;   // บล็อกต้นทางใน Shopify
  img: string | null;
  body: string;   // เนื้อหา HTML (ล้างแล้ว ไม่มี script/style/class ติดมา)
}

export const articles = raw as Article[];

export const getArticle = (handle: string) => articles.find((a) => a.h === handle);

/** บทความอื่นที่น่าอ่านต่อ — ในบล็อกเดียวกันก่อน แล้วค่อยตามด้วยใบใหม่สุด */
export function relatedArticles(a: Article, n = 6) {
  const same = articles.filter((x) => x.h !== a.h && x.blog === a.blog);
  const rest = articles.filter((x) => x.h !== a.h && x.blog !== a.blog);
  return [...same, ...rest].slice(0, n);
}

export const thaiDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
};
