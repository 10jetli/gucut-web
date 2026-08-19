// บอกเครื่องค้นหาทันทีว่าเว็บอัปเดตแล้ว — IndexNow
//
// ปกติต้องรอ Google/Bing เดินมาเจอเองซึ่งใช้เวลาเป็นวัน
// IndexNow คือการ "โทรบอก" ว่าหน้านี้เปลี่ยนแล้ว มาเก็บใหม่ได้เลย
// รองรับโดย Bing · Yandex · Seznam · Naver (Google กำลังทดสอบ)
// ฟรี ไม่มีค่าใช้จ่าย แค่ต้องมีไฟล์กุญแจวางไว้บนเว็บให้มันมาตรวจว่าเป็นเจ้าของจริง
//
// ⚠️ ส่งเฉพาะ "หน้าหลักที่เปลี่ยนบ่อย" เท่านั้น ไม่ส่งสินค้าทั้ง 2,482 หน้าทุกครั้ง
//    IndexNow มีไว้บอกหน้าที่เปลี่ยนจริง ยิงทั้งเว็บทุก deploy คือสแปม
//    และเสี่ยงโดนเมินทั้งโดเมน · อยากส่งทั้งเว็บให้กดปุ่มในหลังร้านเอาเอง
//
// ⚠️ ไม่ให้ build ล้มถ้าส่งไม่สำเร็จ — แจ้งเครื่องค้นหาไม่ได้ ไม่ใช่เหตุให้เว็บขึ้นไม่ได้
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://gucut.com").replace(/\/$/, "");
const host = new URL(SITE).hostname;

let key = "";
try {
  key = JSON.parse(fs.readFileSync(path.join(root, "src/lib/indexnow-key.json"), "utf8")).key;
} catch { /* ไม่มีกุญแจก็ข้ามไป */ }

if (!key) {
  console.log("ping-indexnow: ยังไม่มีกุญแจ ข้ามไป");
  process.exit(0);
}

const urls = [
  "/", "/categories/", "/articles/", "/faq/", "/videos/",
  "/llms.txt", "/llms-full.txt", "/agents.md", "/products.json", "/sitemap.xml",
].map((p) => `${SITE}${p}`);

const body = {
  host,
  key,
  keyLocation: `${SITE}/${key}.txt`,
  urlList: urls,
};

try {
  const r = await fetch("https://api.indexnow.org/IndexNow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  console.log(`ping-indexnow: ส่ง ${urls.length} หน้า → ตอบ ${r.status}` +
    (r.status === 200 || r.status === 202 ? " (สำเร็จ)" : ""));
} catch (e) {
  console.log("ping-indexnow: ส่งไม่สำเร็จ —", String(e?.message || e).slice(0, 100));
}
