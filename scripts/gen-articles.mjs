// ดึงบทความจากบล็อกเดิมบน Shopify มาเก็บไว้ในโปรเจกต์ → src/data/articles.json
//
// ดึงจาก "หน้าร้านสาธารณะ" (www.gucut.com/blogs/...) ไม่ต้องใช้รหัส API ใด ๆ
// พอปิดร้าน Shopify บทความก็ยังอยู่กับเรา เหมือนที่ทำกับสินค้า รูป รีวิว และคลิป
//
//   node scripts/gen-articles.mjs
//
// ทำไมไม่ใช้ฟีด Atom: ฟีดของ Shopify ส่งมาแค่บล็อกละ 30 ชิ้น และไม่มีรูปปก
// จึงต้องไล่อ่านหน้าเว็บจริงทีละหน้าแทน
//
// ⚠️ ตัวนี้พึ่งโครงหน้าเว็บของธีมเดิม (class "article-template__content")
//    ถ้าวันหนึ่งธีมเปลี่ยนแล้วดึงไม่ได้ ไม่ต้องตกใจ — ข้อมูลที่ดึงมาแล้วอยู่ใน
//    src/data/articles.json เรียบร้อย ไม่ได้พึ่ง Shopify ตอนเว็บทำงาน
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const SITE = "https://www.gucut.com";
const BLOGS = ["news", "seo", "เลื่อยยนต์", "t123", "ຈັກຕັດໄມ້"];
const OUT = new URL("../src/data/articles.json", import.meta.url);
const IMG_DIR = new URL("../public/art/", import.meta.url);

const dec = (s) =>
  s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

// handle บางอันคือคำถามยาวทั้งประโยค (ยาวเกิน 250 ตัวอักษร) เอามาทำเป็นชื่อไฟล์
// ตอน build ไม่ได้ ระบบไฟล์รับไม่ไหว — ตัดให้สั้นลงโดยตัดตรงขีดคั่นคำ
// ภาษาไทยตัวละ 3 ไบต์ จึงคุมที่ 90 ตัวอักษรเพื่อให้ปลอดภัยกับ macOS/Linux
const shorten = (h) => {
  if (h.length <= 90) return h;
  const cut = h.slice(0, 90);
  const dash = cut.lastIndexOf("-");
  return dash > 40 ? cut.slice(0, dash) : cut;
};

const get = (url) => fetch(url).then((r) => (r.ok ? r.text() : "")).catch(() => "");

// ---------------------------------------------------------------------------
// ล้าง HTML ที่ติดมาจากที่ต่าง ๆ
// บทความหลายชิ้นก๊อปมาจาก Facebook/ChatGPT เลยพก class ประหลาด ๆ กับรูปอีโมจิ
// จาก fbcdn ติดมาด้วย ถ้าปล่อยไว้หน้าเว็บจะเพี้ยนและยังต้องพึ่งเซิร์ฟเวอร์คนอื่น
// ---------------------------------------------------------------------------
function tidy(html) {
  return html
    // สคริปต์/สไตล์/เมนู ที่ติดมากับเนื้อหา — ไม่เอาทั้งก้อน
    .replace(/<(script|style|iframe|nav)[\s\S]*?<\/\1>/gi, "")
    .replace(/<img[^>]*static\.xx\.fbcdn\.net[^>]*alt="([^"]*)"[^>]*>/g, "$1")
    .replace(/<img[^>]*static\.xx\.fbcdn\.net[^>]*>/g, "")
    .replace(/\s(?:class|style|dir|tabindex|height|width|loading|sizes|srcset)="[^"]*"/g, "")
    .replace(/\sdata-[a-z-]+="[^"]*"/g, "")
    .replace(/<\/?span>/g, "")
    .replace(/<div>\s*<\/div>/g, "")
    .replace(/<a>\s*<\/a>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function grab(url) {
  const clean = url.split("?")[0].replace(/^\/\//, "https://");
  const name = clean.split("/").pop().replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
  const file = new URL(name, IMG_DIR);
  if (!existsSync(file)) {
    const r = await fetch(clean.startsWith("http") ? clean : `https:${clean}`);
    if (!r.ok) return null;
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
  }
  return `/art/${name}`;
}

async function localImages(html) {
  const urls = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => u.includes("cdn.shopify.com"));
  let out = html;
  for (const u of new Set(urls)) {
    const local = await grab(u).catch(() => null);
    if (local) out = out.split(u).join(local);
  }
  return out;
}

// ตัดเอาเฉพาะเนื้อบทความออกจากหน้าเว็บเต็ม ๆ
function extract(html) {
  const start = html.indexOf('class="article-template__content');
  if (start < 0) return "";
  const open = html.indexOf(">", start) + 1;
  // จบตรงบล็อก "กลับไปหน้าบทความ" ที่ธีมวางไว้ท้ายเนื้อหาเสมอ
  let end = html.indexOf("article-template__back", open);
  if (end < 0) end = html.indexOf("</article>", open);
  if (end < 0) return "";
  return html.slice(open, end).replace(/<div[^>]*$/, "").replace(/(<\/div>\s*)+$/, "");
}

await mkdir(IMG_DIR, { recursive: true });

// รันซ้ำได้ — ของที่เคยดึงมาแล้วเก็บไว้ เพิ่มเฉพาะที่ยังขาด
// (หน้าเว็บ Shopify บางครั้งตอบไม่ครบ รันอีกรอบแล้วได้เพิ่ม)
let old = [];
try { old = JSON.parse(await readFile(OUT, "utf8")); } catch { /* ยังไม่เคยดึง */ }
const seen = new Set(old.map((a) => a.h));
const articles = [...old];

for (const blog of BLOGS) {
  const links = new Set();
  for (let page = 1; page <= 12; page++) {
    const html = await get(`${SITE}/blogs/${encodeURIComponent(blog)}?page=${page}`);
    const found = [...html.matchAll(/href="(\/blogs\/[^"?#]+\/[^"?#]+)"/g)].map((m) => m[1]);
    const fresh = found.filter((u) => !links.has(u));
    if (!fresh.length) break;
    fresh.forEach((u) => links.add(u));
  }

  for (const path of links) {
    const handle = shorten(decodeURIComponent(path.split("/").pop()));
    if (seen.has(handle)) continue;
    seen.add(handle);

    const html = await get(SITE + path);
    const raw = extract(html);
    if (!raw) { console.log(`  ⚠️ อ่านเนื้อหาไม่ได้: ${handle}`); continue; }

    const title = dec((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "").replace(/<[^>]+>/g, "").trim();
    const at = (html.match(/<time[^>]*datetime="([^"]+)"/) || [])[1] || "";
    const ogRaw = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || "";
    const desc = dec((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "").trim();

    const body = await localImages(tidy(dec(raw)));
    const cover = ogRaw ? await grab(ogRaw).catch(() => null) : null;

    articles.push({
      h: handle,
      t: title,
      d: desc.slice(0, 300),
      at: at.slice(0, 10),
      blog,
      img: cover || (body.match(/<img[^>]+src="([^"]+)"/) || [])[1] || null,
      body,
    });
  }
  console.log(`  ${blog}: รวมสะสม ${articles.length} บทความ`);
}

articles.sort((a, b) => (a.at < b.at ? 1 : -1));
await writeFile(OUT, `${JSON.stringify(articles)}\n`);

const kb = Math.round(JSON.stringify(articles).length / 1024);
console.log(`\nเก็บได้ ${articles.length} บทความ · ${kb} KB → src/data/articles.json`);
