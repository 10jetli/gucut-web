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

// ---------------------------------------------------------------------------
// ล้างลิงก์ในเนื้อบทความก่อนเอาไปแสดง — ทำตอนโหลด ไม่ได้ไปแก้ไฟล์ข้อมูล
//
// ของเดิมที่ดึงมาจากบล็อก Shopify มีลิงก์ 89 จุดเขียนเต็มเป็น https://www.gucut.com/...
// ซึ่งทุกจุดโดน 301 เด้งไปโดเมนไม่มี www (กติกาใน netlify.toml)
// ผลคือคนกดต้องรอสองจังหวะ และ Google เสีย "โควตาการไล่เก็บ" ไปกับการเด้งเปล่า ๆ
// SearchPie เรียกปัญหาแบบนี้ว่า redirect chain — เป็นข้อที่หักคะแนนจริง
//
// แก้ตรงนี้ที่เดียวแทนการแก้ไฟล์ articles.json เพราะถ้าวันหน้ารัน
// scripts/gen-articles.mjs ใหม่ ไฟล์จะถูกเขียนทับแล้วปัญหากลับมาอีก
// ---------------------------------------------------------------------------
const OWN = /https?:\/\/(?:www\.)?(?:gucut|new78)\.com/gi;

export function tidyLinks(html: string) {
  return html
    .replace(OWN, "")                                  // ลิงก์บ้านตัวเอง → เขียนแบบสั้น
    .replace(/href="\/blogs\/[^/"]+\/([^"]+)"/g, 'href="/articles/$1/"'); // URL บล็อกเดิม
}

export const articles = (raw as Article[]).map((a) => ({ ...a, body: tidyLinks(a.body) }));

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
