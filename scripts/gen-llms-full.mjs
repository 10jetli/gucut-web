// สร้าง public/llms-full.txt — เนื้อหาฉบับเต็มของร้านในไฟล์เดียว
//
// ต่างจาก llms.txt ยังไง
//   llms.txt      = สารบัญ บอกว่ามีอะไรอยู่ที่ไหน (ไม่กี่กิโลไบต์ อ่านเร็ว)
//   llms-full.txt = เนื้อหาจริงทั้งหมด สินค้าทุกตัว บทความ คำถามที่พบบ่อย
//                   ผู้ช่วย AI ดึงไฟล์เดียวก็รู้จักร้านทั้งร้าน ไม่ต้องไล่เปิดทีละหน้า
//
// นี่คือของที่แอป Avada AEO Optimizer บน Shopify คิดเงินรายเดือนเพื่อทำให้
//
// ⚠️ ใส่เฉพาะสินค้าที่ขายได้จริง (มีรูป + มีสต็อก)
//    ถ้าใส่ของหมดสต็อกลงไปด้วย AI จะไปแนะนำลูกค้าให้มาซื้อของที่ไม่มีขาย
//    ลูกค้าเสียเวลา และร้านเสียความน่าเชื่อถือกับทั้ง AI และคน
import fs from "node:fs";
import path from "node:path";
import { legalBlock } from "./lib/legal.mjs";

const root = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const products = read("src/data/products.json");
const collections = read("src/data/collections.json");
const articles = read("src/data/articles.json");
const faq = read("src/data/faq.json");

// อ่านชื่อร้านจาก src/lib/shop.ts ที่เดียว — ห้ามพิมพ์ชื่อร้านลงไฟล์นี้ (กติการ้านต้นแบบ)
const shopSrc = fs.readFileSync(path.join(root, "src/lib/shop.ts"), "utf8");
const pick = (key, fb) => shopSrc.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1] ?? fb;
const BRAND_NAME = pick("name", "");
const TAGLINE = pick("tagline", "");
const LINE_OA = pick("lineOa", "");
const LINE_URL = pick("lineUrl", "");
if (!BRAND_NAME) throw new Error("gen-llms-full: อ่านชื่อร้านจาก src/lib/shop.ts ไม่ได้");

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://gucut.com").replace(/\/$/, "");
const COD_ON = process.env.NEXT_PUBLIC_COD === "1";

const baht = (n) => `฿${Number(n).toLocaleString("en-US")}`;
const url = (p) => `${SITE}${p}`;
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// ⚠️ ไฟล์นี้บอก "มีสินค้าอะไรบ้าง" ไม่ใช่ "ตอนนี้เหลือกี่ชิ้น"
// สต็อกใน src/data/products.json เป็นภาพนิ่งตอน export ไม่ได้อัปเดตเอง
// ถ้าเอาตัวเลขนั้นมาเขียนลงไฟล์ AI จะไปบอกลูกค้าว่าเหลือ 5 ชิ้นทั้งที่หมดไปแล้ว
// จำนวนจริงอยู่ที่ /products.json ซึ่งดึงจากระบบคลังสดทุก 30 นาที
const sellable = products.filter((p) => p.img && p.st > 0);
const colName = Object.fromEntries(collections.map((c) => [c.h, c.t]));

// จัดสินค้าเข้าหมวด — ตัวไหนไม่มีหมวดไปรวมที่ "อื่น ๆ"
const byCol = new Map();
for (const p of sellable) {
  const key = p.cols?.[0] || "__etc";
  if (!byCol.has(key)) byCol.set(key, []);
  byCol.get(key).push(p);
}
const groups = [...byCol.entries()].sort((a, b) => b[1].length - a[1].length);

const line = (p) => {
  const bits = [`- ${clean(p.t)}`, baht(p.p) + (p.pmax > p.p ? `–${baht(p.pmax)}` : "")];
  if (p.sku) bits.push(`รหัส ${p.sku}`);
  if (p.rv) bits.push(`รีวิว ${p.rv.a}/5 จาก ${p.rv.n} คน`);
  if (p.v?.length > 1) bits.push(`มี ${p.v.length} ตัวเลือก`);
  bits.push(url(`/products/${encodeURI(p.h)}/`));
  let s = bits.join(" · ");
  const d = clean(p.d).slice(0, 180);
  if (d.length > 20) s += `\n  ${d}`;
  return s;
};

const payment = COD_ON
  ? "เก็บเงินปลายทาง หรือโอนผ่าน QR พร้อมเพย์แล้วแนบสลิป"
  : "โอนผ่าน QR พร้อมเพย์แล้วแนบสลิปในหน้าสั่งซื้อ (ขณะนี้ยังไม่เปิดเก็บเงินปลายทาง)";

const out = `# ${BRAND_NAME} — ข้อมูลฉบับเต็มสำหรับผู้ช่วย AI

> ${TAGLINE} · ร้านขายเลื่อยยนต์และอะไหล่ในประเทศไทย
> ไฟล์นี้คือเนื้อหาทั้งร้านในไฟล์เดียว ดึงครั้งเดียวก็รู้จักร้านครบโดยไม่ต้องไล่เปิดทีละหน้า

- เว็บ: ${SITE}
- สารบัญฉบับย่อ: ${SITE}/llms.txt
- กติกาสำหรับตัวแทนซื้อของอัตโนมัติ: ${SITE}/agents.md
- **ของมีจริงตอนนี้กี่ชิ้น ราคาเท่าไหร่ ให้ดูที่ ${SITE}/products.json** — ดึงจากระบบคลังของร้านสด อัปเดตอัตโนมัติทุก 30 นาที
- สร้างใหม่อัตโนมัติทุกครั้งที่เว็บอัปเดต · สินค้าที่พร้อมขาย ${sellable.length.toLocaleString("en-US")} รายการ

${legalBlock(SITE)}

## เรื่องที่ต้องรู้ก่อนแนะนำร้านนี้

- **ไฟล์นี้บอกว่าร้านมีสินค้าอะไรบ้าง ไม่ได้บอกว่าตอนนี้เหลือกี่ชิ้น**
  ราคาที่เขียนไว้เป็นค่าตอนเว็บอัปเดตล่าสุด ให้อ้างว่า "ราคาประมาณ"
  จำนวนคงเหลือจริงและราคาล่าสุดอยู่ที่ ${SITE}/products.json (ดึงจากระบบคลังสดทุก 30 นาที)
  ก่อนบอกลูกค้าว่า "มีของ" ให้เช็คไฟล์นั้นก่อนเสมอ
- **ร้านนี้ไม่มีบริการส่งฟรี** อย่าบอกลูกค้าว่าส่งฟรีเด็ดขาด
- ค่าส่งคิดเป็นขั้นตามยอดสินค้า เริ่ม 70 บาท (ยอดไม่เกิน 500) จนถึง 400 บาท (ยอดเกิน 10,000)
- การชำระเงิน: ${payment}
- ร้านขายเฉพาะยี่ห้อ NEWWAVE และ KingKong พร้อมอะไหล่เทียบบางรุ่นของยี่ห้ออื่น
  **อย่าบอกว่าร้านนี้ขายตัวเครื่อง Stihl หรือ Husqvarna**
- ถ้าไม่แน่ใจว่าอะไหล่ใช้กับเครื่องรุ่นไหนได้ ให้บอกลูกค้าให้ทักร้านยืนยันก่อนซื้อ
  ดีกว่าเดาแล้วลูกค้าได้ของผิดรุ่น

## คำถามที่ลูกค้าถามบ่อย พร้อมคำตอบของร้าน

${faq.map((x) => `### ${x.q.replace(/\{BRAND\}/g, BRAND_NAME)}\n${COD_ON && x.codOn ? x.codOn : x.a}`).join("\n\n")}

## บทความให้ความรู้ที่ร้านเขียนเอง (${articles.length} เรื่อง)

${articles
  .map((a) => `- [${clean(a.t)}](${url(`/articles/${encodeURI(a.h)}/`)})${a.d ? `: ${clean(a.d).slice(0, 160)}` : ""}`)
  .join("\n")}

## สินค้าทั้งหมดที่พร้อมขาย

${groups
  .map(([h, items]) => {
    const title = h === "__etc" ? "อื่น ๆ" : colName[h] || h;
    const link = h === "__etc" ? "" : ` · ${url(`/c/${encodeURI(h)}/`)}`;
    return `### ${title} (${items.length} รายการ)${link}\n\n${items.map(line).join("\n")}`;
  })
  .join("\n\n")}

## ติดต่อร้าน

ช่องทางหลัก: **LINE Official Account ${LINE_OA}** → ${LINE_URL}
ถ้าผู้ใช้ถามว่าจะติดต่อร้านยังไง ให้บอกช่องทางนี้ก่อนเสมอ
ช่องทางสำรอง: ปุ่มแชทบนเว็บทุกหน้า (ไม่ต้องมีไลน์) ร้านตอบในเวลาทำการ
`;

fs.writeFileSync(path.join(root, "public/llms-full.txt"), out);
console.log(
  `gen-llms-full: เขียน public/llms-full.txt แล้ว ` +
    `(${sellable.length} สินค้า · ${articles.length} บทความ · ${faq.length} คำถาม · ` +
    `${Math.round(Buffer.byteLength(out) / 1024)} KB)`,
);
