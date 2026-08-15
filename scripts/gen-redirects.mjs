// สร้าง 301 redirect จาก URL เดิมบน Shopify มาที่โครงใหม่ → public/_redirects
//
// ทำไมต้องมี: อันดับ Google ที่ร้านสะสมมาอยู่กับ "URL เดิม" ถ้าย้ายโดเมนแล้ว
// URL เก่าตาย 404 หมด อันดับจะหล่นทันที ต้องบอก Google ว่าหน้าเก่าย้ายไปไหน
//
//   node scripts/gen-redirects.mjs
//
// ไฟล์ที่ได้ไม่มีผลกับ new78.com ตอนนี้ (ไม่มี path พวกนี้อยู่แล้ว)
// แต่จะทำงานทันทีที่ gucut.com ชี้มาที่ Netlify — เตรียมไว้ก่อนได้เลย
import { readFile, writeFile } from "node:fs/promises";

const SITE = "https://www.gucut.com";
const BLOGS = ["news", "seo", "เลื่อยยนต์", "t123", "ຈັກຕັດໄມ້"];
const OUT = new URL("../public/_redirects", import.meta.url);

const articles = JSON.parse(await readFile(new URL("../src/data/articles.json", import.meta.url), "utf8"));
const ours = articles.map((a) => a.h);

// ไล่อ่านหน้ารวมบทความเพื่อเอา "handle เต็ม ๆ" ของเดิมมาจับคู่
const full = new Set();
for (const blog of BLOGS) {
  for (let page = 1; page <= 12; page++) {
    const html = await fetch(`${SITE}/blogs/${encodeURIComponent(blog)}?page=${page}`)
      .then((r) => (r.ok ? r.text() : "")).catch(() => "");
    const found = [...html.matchAll(/href="\/blogs\/[^"?#]+\/([^"?#]+)"/g)].map((m) => decodeURIComponent(m[1]));
    const fresh = found.filter((h) => !full.has(h));
    if (!fresh.length) break;
    fresh.forEach((h) => full.add(h));
  }
}

// handle เดิมที่ยาวเกินถูกตัดสั้นตอนดึงมา — ต้องชี้ให้ถูกตัว
const moved = [];
for (const orig of full) {
  if (ours.includes(orig)) continue;                       // ชื่อเดิมใช้ได้ กติกากลางรับได้อยู่แล้ว
  const hit = ours.find((h) => orig.startsWith(h));        // ของเราคือชื่อเดิมที่ถูกตัดหัวท้าย
  if (hit) moved.push([orig, hit]);
}

const lines = [
  "# ---------------------------------------------------------------------------",
  "# 301 จาก URL เดิมสมัยอยู่บน Shopify มาที่โครงใหม่",
  "#",
  "# ไฟล์นี้สร้างด้วย scripts/gen-redirects.mjs — อย่าแก้มือ",
  "# ยังไม่มีผลกับ new78.com (ไม่มี path พวกนี้อยู่แล้ว) แต่จะทำงานทันทีที่",
  "# gucut.com ชี้มาที่ Netlify  ถ้าไม่มีไฟล์นี้ อันดับ Google ที่สะสมมาจะหล่นทันที",
  "# ---------------------------------------------------------------------------",
  "",
  "# บทความที่ชื่อเดิมยาวเกินจนต้องตัดสั้น — ต้องชี้ทีละอัน (ต้องอยู่ก่อนกติกากลาง)",
  ...moved.map(([o, n]) => `/blogs/*/${encodeURI(o)}  /articles/${encodeURI(n)}/  301!`),
  "",
  "# กติกากลาง",
  "/collections/:handle       /c/:handle/          301",
  "/collections               /categories/         301",
  "/blogs/:blog/:handle       /articles/:handle/   301",
  "/blogs/:blog               /articles/           301",
  "/blogs                     /articles/           301",
  "/pages/*                   /                    301",
  "/account/login             /account/login/      301",
  "/cart                      /cart/               301",
  "",
  "# หน้าสินค้าใช้ handle ชุดเดียวกับ Shopify อยู่แล้ว — ไม่ต้องชี้ใหม่",
  "",
];

await writeFile(OUT, lines.join("\n") + "\n");
console.log(`เขียน public/_redirects แล้ว · บทความที่ต้องชี้ทีละอัน ${moved.length} รายการ · เจอ handle เดิมทั้งหมด ${full.size}`);
