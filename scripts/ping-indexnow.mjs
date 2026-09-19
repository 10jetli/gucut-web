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

/* 🔴 **ห้ามยิงออกนอกบ้านตอน build ในเครื่อง** (เพิ่ม 19 ก.ย. 2569)
   เจอตอนรัน `npm run build` ในเครื่องเพื่อ **ตรวจ** ว่า build ผ่าน ⇒ postbuild
   ยิง IndexNow บอก Bing/Yandex ว่า 10 หน้าเปลี่ยนแล้ว **ทั้งที่ไม่มีอะไร deploy ขึ้นไปเลย**
   (วันนี้เป็นวันหยุด deploy ⇒ ข้อมูลที่ส่งไปเป็นเท็จโดยสมบูรณ์)
   ⇒ ยิงซ้ำทุกครั้งที่ใครตรวจ build = สแปม ซึ่งไฟล์นี้เตือนตัวเองไว้ข้างบนแล้วว่าเสี่ยงโดนเมินทั้งโดเมน
   🔑 คลาส: **ขั้นตอน "ตรวจ" ต้องไม่มีผลออกนอกบ้าน**

   ⚠️ **ความเสี่ยงของตัวกันนี้เอง: ถ้าเดาชื่อตัวแปรผิด IndexNow จะไม่ยิงอีกตลอดกาลแบบเงียบ**
      = เอาของที่ทำงานอยู่ไปพัง ซึ่งแย่กว่าปัญหาที่กำลังแก้
      ⇒ จึงดูหลายตัว **และพิมพ์เหตุผลออกมาทุกครั้ง** ⇒ ถ้าวันหนึ่งมันข้ามบน Netlify จริง
        บรรทัดนี้จะอยู่ใน build log ให้เห็น (ทางถอยต้องประกาศตัวเมื่อถูกใช้)
      ⚠️ ยังไม่ได้ยืนยันด้วย build จริงบน Netlify — **ต้องดู build log รอบแรกหลังปลดวันหยุด deploy**
   ⚠️ ปลดล็อกมือได้ด้วย `INDEXNOW_FORCE=1` */
const ตัวบ่งชี้Netlify = ["NETLIFY", "DEPLOY_PRIME_URL", "NETLIFY_BUILD_BASE", "BUILD_ID", "SITE_NAME"]
  .filter((k) => process.env[k]);
if (!ตัวบ่งชี้Netlify.length && process.env.INDEXNOW_FORCE !== "1") {
  console.log(
    "ping-indexnow: ข้าม — ไม่พบตัวบ่งชี้ว่า build บน Netlify (หาจาก NETLIFY · DEPLOY_PRIME_URL · " +
    "NETLIFY_BUILD_BASE · BUILD_ID · SITE_NAME) ⇒ การ build ในเครื่องต้องไม่ยิงบอกเครื่องค้นหา\n" +
    "   ⚠️ ถ้าเห็นบรรทัดนี้ใน build log ของ Netlify แปลว่าชื่อตัวแปรที่ใช้ตรวจผิด — ต้องแก้ทันที"
  );
  process.exit(0);
}
if (process.env.INDEXNOW_FORCE === "1") console.log("ping-indexnow: สั่งยิงด้วยมือ (INDEXNOW_FORCE=1)");
else console.log(`ping-indexnow: อยู่บน Netlify (เจอ ${ตัวบ่งชี้Netlify.join(", ")}) ⇒ ยิงตามปกติ`);

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
