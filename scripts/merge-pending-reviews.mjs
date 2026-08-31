// รวมรีวิวใหม่ที่ /api/reviews-ingest เก็บไว้ เข้ากับ src/data/reviews.json ตอน build
//
// ทำไมต้องรวมตอน build ไม่ใช่ตอนลูกค้าเปิดหน้า:
//   หน้ารีวิวถูก build เป็นไฟล์นิ่ง (public/rv/<id>.json) และดาว/จำนวนรีวิวถูกฝังในการ์ดสินค้า
//   ถ้าอ่านสดตอนเปิดหน้า ต้องรื้อทั้งระบบ · รวมตอน build จึงเป็นทางที่ไม่แตะของเดิมเลย
//
// ⚠️ ห้ามเขียนทับ src/data/reviews.json ในดิสก์ของ repo แล้ว commit อัตโนมัติ
//    ไฟล์นี้แก้เฉพาะ "ในรอบ build" (Netlify สร้างเครื่องใหม่ทุกครั้ง) — Blobs คือแหล่งจริงของรีวิวใหม่
//    เปิดเว็บดูจะเห็นรีวิวใหม่ทันทีหลัง deploy โดยที่ git ไม่รก
//
// ⚠️ ต้องรันก่อน gen-review-images.mjs และ gen-reviews.mjs เสมอ (สองตัวนั้นอ่านไฟล์นี้ต่อ)
// ⚠️ ไม่มี Blobs / ยิงไม่ได้ = ข้ามเงียบ ๆ ห้ามทำ build ตก — รีวิวใหม่ไม่ขึ้นดีกว่าเว็บ deploy ไม่ได้
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const FILE = join(root, "src/data/reviews.json");

async function pending() {
  let getStore;
  try {
    ({ getStore } = await import("@netlify/blobs"));
  } catch {
    return null; // รันในเครื่องที่ไม่มีแพ็กเกจ
  }
  try {
    const store = getStore({ name: "gucut-reviews", consistency: "strong" });
    const { blobs } = await store.list({ prefix: "r/" });
    if (!blobs.length) return [];
    const out = [];
    // ดึงทีละ 20 ก้อนพร้อมกัน — รีวิวหลักพันก็ยังทันในเวลา build
    for (let i = 0; i < blobs.length; i += 20) {
      const chunk = blobs.slice(i, i + 20);
      const got = await Promise.all(chunk.map((b) => store.get(b.key, { type: "json" }).catch(() => null)));
      out.push(...got.filter(Boolean));
    }
    return out;
  } catch (e) {
    console.log(`merge-pending-reviews: อ่าน Blobs ไม่ได้ (${e?.message || e}) — ข้ามรอบนี้`);
    return null;
  }
}

const fresh = await pending();
if (!fresh) {
  console.log("merge-pending-reviews: ไม่มีที่เก็บรีวิวใหม่ — ใช้ reviews.json เดิม");
  process.exit(0);
}
if (!fresh.length) {
  console.log("merge-pending-reviews: ไม่มีรีวิวใหม่รอ");
  process.exit(0);
}

const data = JSON.parse(readFileSync(FILE, "utf8"));

// ── แปลงรหัสสินค้า (SKU) เป็นชื่อลิงก์สินค้า (handle) ──
// ⚠️ ตัวเก็บรีวิวจากมาร์เก็ตเพลสหยิบ "รหัสสินค้า" มาได้ง่ายกว่า handle
//    (Seller Centre โชว์ SKU ไม่ได้โชว์ลิงก์เว็บเรา) จึงส่ง SKU มาในช่อง handle
//    ไม่แปลง = จับคู่สินค้าไม่ติดสักตัว แล้วรีวิวกองค้างใน Blobs เงียบ ๆ ตลอดไป
//    (เจอของจริง 31 ส.ค. 2569 รอบแรกที่งานตั้งเวลารันเอง — 53 ใบจับคู่ไม่ติดเลยสักใบ)
const skuToHandle = new Map();
try {
  const products = JSON.parse(readFileSync(join(root, "src/data/products.json"), "utf8"));
  for (const p of Array.isArray(products) ? products : []) {
    if (!p?.h) continue;
    const skus = [].concat(p.sku || [], (p.v || []).map((x) => x?.sku).filter(Boolean));
    for (const s of skus) {
      const k = String(s || "").trim().toUpperCase();
      if (k && !skuToHandle.has(k)) skuToHandle.set(k, p.h);
    }
  }
} catch (e) {
  console.log(`merge-pending-reviews: อ่าน products.json ไม่ได้ (${e?.message || e}) — แปลง SKU ไม่ได้รอบนี้`);
}

/** คืน handle ที่ใช้ได้จริง — ลองตรง ๆ ก่อน ไม่เจอค่อยลองแปลงจาก SKU */
function resolveHandle(h) {
  if (!h) return null;
  if (data[h]) return h;
  const viaSku = skuToHandle.get(String(h).trim().toUpperCase());
  return viaSku && data[viaSku] ? viaSku : null;
}

/** ยอดรวมทั้งไฟล์ — ใช้เทียบก่อน/หลัง เพื่อกันรีวิวเก่าหาย */
const tally = (d) => {
  let count = 0;
  let items = 0;
  for (const v of Object.values(d)) {
    count += Number(v.count) || 0;
    items += (v.items || []).length;
  }
  return { count, items };
};
const before = tally(data);

// ลายนิ้วมือของที่มีอยู่แล้ว — กันซ้ำอีกชั้นเผื่อรีวิวเดิมเคยถูกดึงเข้ามาด้วยมือ
const seen = new Set();
for (const [handle, v] of Object.entries(data)) {
  for (const it of v.items || []) {
    seen.add(`${handle}|${it.author || ""}|${(it.text || "").slice(0, 60)}|${it.date || ""}`);
  }
}

let merged = 0;
let skipDup = 0;
let noProduct = 0;
// นับแยกรายสินค้า — ใช้ตอนอัปเดตยอด/ดาว (ดูคำเตือนใหญ่ข้างล่าง)
const addedPer = new Map(); // handle → { n, sum }

let viaSku = 0;
for (const r of fresh) {
  // สินค้าที่ยังไม่มีในเว็บ (เช่นยังไม่ปลด draft) — เก็บไว้ใน Blobs ต่อ รอบหน้าค่อยเข้า
  const handle = resolveHandle(r.handle);
  if (!handle) {
    noProduct++;
    continue;
  }
  if (handle !== r.handle) viaSku++;

  const key = `${handle}|${r.author || ""}|${(r.text || "").slice(0, 60)}|${r.date || ""}`;
  if (seen.has(key)) {
    skipDup++;
    continue;
  }
  const item = {
    src: r.platform,
    rating: r.rating,
    author: r.author,
    text: r.text,
    images: r.images || [],
    date: r.date,
  };
  // คลิปใต้รีวิว — หน้าเว็บรองรับอยู่แล้ว (ReviewCard + ตัวกรอง "มีคลิป")
  // ⚠️ เอาเฉพาะคลิปที่เก็บลง R2 สำเร็จแล้วเท่านั้น (มี id) — ตัวที่ยังเป็นลิงก์ต้นทาง
  //    ลิงก์ตายไปแล้วตอนถึง build จะได้กรอบดำบนหน้าสินค้า
  if (r.video && typeof r.video === "object" && r.video.id) item.video = r.video;
  data[handle].items.push(item);
  seen.add(key);
  merged++;
  const acc = addedPer.get(handle) || { n: 0, sum: 0 };
  acc.n++;
  acc.sum += r.rating || 0;
  addedPer.set(handle, acc);
}

if (merged > 0) {
  // ⚠️ ห้ามคิด count/avg ใหม่จาก items.length เด็ดขาด
  //    `count` คือ "จำนวนรีวิวทั้งหมดที่มาร์เก็ตเพลสบอก" ส่วน `items` เป็นแค่ตัวอย่างที่เก็บมา
  //    (เช่น count 366 แต่ items มี 188 ใบ) — คิดใหม่จาก items = ยอดรีวิวหายไปครึ่งหนึ่ง
  //    ทดสอบจริง 31 ส.ค. 2569: รวมรีวิวใหม่ใบเดียว ทำสินค้า 32 ตัวยอดตกทันที (366 → 189)
  //    ต้องบวกเพิ่มจากของเดิม และเฉลี่ยดาวแบบถ่วงน้ำหนักเท่านั้น
  for (const [handle, acc] of addedPer) {
    const v = data[handle];
    if (!v) continue;
    const oldCount = Number(v.count) || (v.items || []).length - acc.n;
    const oldAvg = Number(v.avg) || 0;
    const newCount = oldCount + acc.n;
    v.count = newCount;
    v.avg = newCount ? Math.round(((oldAvg * oldCount + acc.sum) / newCount) * 10) / 10 : oldAvg;
  }

  // ── ตาข่ายกันรีวิวเก่าหาย ──
  // เจ้าของร้านสั่งไว้ชัด "อย่าลบรีวิวเก่า" (31 ส.ค. 2569)
  // ขั้นตอนนี้มีหน้าที่ "เพิ่ม" อย่างเดียว ยอดรวมจึงต้องไม่มีวันลดลง
  // ถ้าลดเมื่อไหร่ = มีบั๊ก (เคยเกิดจริง: คิด count ใหม่จาก items แล้วยอด 366 เหลือ 189)
  // ⚠️ เจอแล้วต้องทิ้งผลรอบนี้ ไม่เขียนไฟล์ — รีวิวใหม่ไม่ขึ้นดีกว่ารีวิวเก่าหาย
  const after = tally(data);
  if (after.count < before.count || after.items < before.items) {
    console.log(
      `merge-pending-reviews: ⛔ ยกเลิก — ยอดรีวิวจะลดลง ` +
        `(รวม ${before.count}→${after.count} · ข้อความ ${before.items}→${after.items}) ` +
        `ใช้ reviews.json เดิมแทน`
    );
    process.exit(0);
  }
  writeFileSync(FILE, JSON.stringify(data, null, 1));
  console.log(`merge-pending-reviews: ยอดรีวิวรวม ${before.count} → ${after.count}`);
}

console.log(
  `merge-pending-reviews: รวมใหม่ ${merged} · ซ้ำข้าม ${skipDup} · ยังไม่มีสินค้าในเว็บ ${noProduct} (รอรอบหน้า)` +
    (viaSku ? ` · จับคู่ผ่าน SKU ${viaSku}` : "")
);
