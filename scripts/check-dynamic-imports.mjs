/* 🛡️ ด่าน: ในโฟลเดอร์ `netlify/` **ห้าม `import()` ที่อาร์กิวเมนต์ไม่ใช่ข้อความคงที่**
 *
 * 🔴 **ของจริงบนเว็บจริง 2 รอบ — คลาสเดียวกัน ต่างไฟล์**
 *   ① `netlify/functions/token-refresh.mjs` (แก้แล้ว · บทเรียนเขียนไว้ในไฟล์นั้น)
 *      เดิมวน `await import(p.mod)` ⇒ ขึ้นจริงแล้วตอบ "Cannot find module …/lib/lazada.mjs" ทั้งสามเจ้า
 *   ② `netlify/lib/marketplace-listings.mjs` (เจอ 20 ต.ค. 2569 23:0x — **ฝั่งจอจับได้ ไม่ใช่ด่าน**)
 *      `await import(mod)` ⇒ `list=stock&marketplaces=1` คืน `marketplacesFailed` ครบสามเจ้า
 *      `checkedMarketplaces` เหลือ `["gucut"]` ⇒ คอลัมน์ Marketplace ขึ้น "อัปเดตไม่ได้" ทั้งจอ
 *
 * 🔑 **ทำไมต้องเป็นด่าน ไม่ใช่คอมเมนต์**: คอมเมนต์เตือนมีอยู่แล้วตั้งแต่รอบ ① และเขียนละเอียดมาก
 *    แต่มันอยู่ใน**ไฟล์ที่แก้ไปแล้ว** ⇒ ไฟล์อื่นไม่มีใครตาม
 *    (คลาสที่ `marketplace-listings.mjs` เตือนไว้เองว่า "กฎถูกบังคับที่เจ้าแรก แล้วเจ้าที่เหลือไม่มีใครตาม")
 *
 * ⚠️ **ของนี้ build จับไม่ได้เลย** — `npm run build` ผ่าน · เทสผ่าน · รันในเครื่องก็ถูก
 *    เพราะพาธ relative ถูกต้องตอนไฟล์ยังอยู่ที่เดิม · **มันพังเฉพาะหลังถูก bundle**
 *    ⇒ ด่านนี้คือชั้นเดียวที่จับได้ก่อนขึ้นเว็บ
 *
 * ท่าที่ถูก: `{ load: () => import("../lib/shopee.mjs") }` — ข้อความคงที่ใน arrow function
 * ท่าที่ผิด: `await import(mod)` · `await import(p.mod)` · `await import("../lib/" + ชื่อ)`
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ตัดคอมเมนต์ } from "./_strip-comments.mjs";

const ราก = "netlify";

function ไฟล์ทั้งหมด(ที่) {
  const out = [];
  for (const ชื่อ of readdirSync(ที่)) {
    const เส้น = join(ที่, ชื่อ);
    if (statSync(เส้น).isDirectory()) out.push(...ไฟล์ทั้งหมด(เส้น));
    else if (ชื่อ.endsWith(".mjs") || ชื่อ.endsWith(".js")) out.push(เส้น);
  }
  return out;
}

/** หา `import(` ที่อาร์กิวเมนต์ตัวแรกไม่ใช่สตริงคงที่ — คืนรายการ {ไฟล์, บรรทัด, ข้อความ} */
export function หาimportที่ไม่คงที่(เนื้อ, ชื่อไฟล์ = "(ในหน่วยความจำ)") {
  /* 🔑 ตัดคอมเมนต์ด้วย **ตัวกลางของรีโป** ไม่ใช่ regex ของตัวเอง
     (ไฟล์นี้เองจะมีคำว่า `import(mod)` อยู่ในคอมเมนต์หัวไฟล์ ⇒ ไม่ตัด = ด่านฟ้องตัวเอง) */
  const โค้ด = ตัดคอมเมนต์(เนื้อ, ชื่อไฟล์, { คงเลขบรรทัด: true });
  const พบ = [];
  for (const m of โค้ด.matchAll(/\bimport\s*\(\s*([^)]{0,80})/g)) {
    const อาร์ก = m[1].trim();
    if (!อาร์ก) continue;                       // `import()` เปล่า — ไวยากรณ์ผิดอยู่แล้ว ปล่อยให้ node --check จับ
    /* 🔴 **ขึ้นต้นด้วยเครื่องหมายคำพูดไม่พอ** — selftest ของด่านนี้จับรูของตัวเองได้:
       `import("../lib/" + ชื่อ)` ขึ้นต้นด้วย `"` แต่เป็นการต่อสตริง ⇒ bundler ตามรอยไม่ได้เหมือนกัน
       ⇒ เกณฑ์ที่ถูกคือ **อาร์กิวเมนต์ต้องเป็นสตริงเดี่ยวทั้งอัน ไม่มีอะไรต่อท้าย** */
    const เป็นสตริงเดี่ยว = (() => {
      const q = อาร์ก[0];
      if (!["'", '"', "`"].includes(q)) return false;
      if (q === "`" && อาร์ก.includes("${")) return false;   // เทมเพลตมีตัวแปร
      let i = 1;
      while (i < อาร์ก.length) {
        if (อาร์ก[i] === "\\") { i += 2; continue; }
        if (อาร์ก[i] === q) break;
        i++;
      }
      if (i >= อาร์ก.length) return false;                   // ไม่เจอตัวปิด
      return อาร์ก.slice(i + 1).trim() === "";               // ต้องไม่มีอะไรต่อท้าย
    })();
    if (เป็นสตริงเดี่ยว) continue;
    if (/^import\.meta\b/.test(อาร์ก)) continue; // import.meta.* ไม่ใช่การโหลดโมดูล
    พบ.push({
      ไฟล์: ชื่อไฟล์,
      บรรทัด: โค้ด.slice(0, m.index).split("\n").length,
      ข้อความ: `import(${อาร์ก.slice(0, 50)}…`,
    });
  }
  return พบ;
}

if (process.argv.includes("--selftest")) {
  /* 🔑 **ตัวควบคุมสองทาง** — ด่านที่พิสูจน์แต่ทางเดียวบอกได้แค่ "มันฟ้องอะไรบ้าง"
     ไม่ได้บอกว่า "มันไม่ฟ้องของที่ถูก" ⇒ ของถูกที่ถูกฟ้องคือแดงลวง ซึ่งแพงกว่าเขียวลวง
     (ใช้ชื่อตัวแปรตามรูปที่ `scripts/lib/ตัวควบคุมสองทาง.mjs` ของรีโปกำหนด) */
  const ต้องจับ = [
    ["ตัวแปรเปล่า", "const x = await import(mod);"],
    ["ช่องของออบเจกต์", "const x = await import(p.mod);"],
    ["ต่อสตริง", 'const x = await import("../lib/" + ชื่อ);'],
    ["เทมเพลตมีตัวแปร", "const x = await import(`../lib/${ชื่อ}.mjs`);"],
  ];
  const ต้องไม่จับ = [
    ["สตริงคงที่", 'const x = await import("./a.mjs");'],
    ["เทมเพลตไม่มีตัวแปร", "const x = await import(`./a.mjs`);"],
    ["ท่าที่ถูก (arrow + สตริง)", 'const f = { load: () => import("./a.mjs") };'],
    ["อยู่ในคอมเมนต์", "// await import(mod)\nconst y = 1;"],
    ["import.meta", "const u = import.meta.url;"],
  ];
  const จับได้ = (โค้ด) => หาimportที่ไม่คงที่(โค้ด, "selftest.mjs").length;
  /* 🔑 ใช้ `.filter()` บนชุดเคสทั้งสองกอง — รูปที่ `ตัวควบคุมสองทาง.mjs` ของรีโปถือว่า
     "ถูกนำไปใช้จริง" (แค่ประกาศอาร์เรย์แล้ววน for ไม่นับ เพราะปลูกของปลอมได้ง่าย) */
  const ปล่อยผ่านทั้งที่ควรจับ = ต้องจับ.filter(([, โค้ด]) => จับได้(โค้ด) < 1);
  const ฟ้องทั้งที่ไม่ควรจับ = ต้องไม่จับ.filter(([, โค้ด]) => จับได้(โค้ด) > 0);
  ต้องจับ.forEach(([ชื่อ, โค้ด]) =>
    console.log(`   ${จับได้(โค้ด) >= 1 ? "✅" : "❌"} ต้องจับ: ${ชื่อ}`));
  ต้องไม่จับ.forEach(([ชื่อ, โค้ด]) =>
    console.log(`   ${จับได้(โค้ด) === 0 ? "✅" : "❌"} ต้องไม่จับ: ${ชื่อ}`));
  const ตก = ปล่อยผ่านทั้งที่ควรจับ.length + ฟ้องทั้งที่ไม่ควรจับ.length;
  if (ปล่อยผ่านทั้งที่ควรจับ.length)
    console.log(`   🔴 ปล่อยผ่านทั้งที่ควรจับ: ${ปล่อยผ่านทั้งที่ควรจับ.map(([n]) => n).join(" · ")}`);
  if (ฟ้องทั้งที่ไม่ควรจับ.length)
    console.log(`   🔴 ฟ้องทั้งที่ไม่ควรจับ (แดงลวง — แพงกว่าเขียวลวง): ${ฟ้องทั้งที่ไม่ควรจับ.map(([n]) => n).join(" · ")}`);
  console.log(ตก ? `🔴 selftest ตก ${ตก}` : "✅ selftest ผ่าน — ด่านแยกแยะได้ทั้งสองทาง");
  process.exit(ตก ? 1 : 0);
}

const ไฟล์ = ไฟล์ทั้งหมด(ราก);
if (!ไฟล์.length) {
  /* 🔑 สแกน 0 ไฟล์แล้วขึ้นเขียว **อันตรายกว่าไม่มีด่าน** (ย้ายโฟลเดอร์ · เปลี่ยนนามสกุล) */
  console.log(`❌ check-dynamic-imports: หาไฟล์ใน ${ราก}/ ไม่เจอเลย ⇒ ด่านนี้ไม่ได้ตรวจอะไร`);
  process.exit(1);
}
const พบ = ไฟล์.flatMap((f) => หาimportที่ไม่คงที่(readFileSync(f, "utf8"), f));
if (พบ.length) {
  console.log(`❌ check-dynamic-imports: เจอ import() ที่ไม่ใช่ข้อความคงที่ ${พบ.length} จุด`);
  console.log("   ⇒ ตัวรวมไฟล์ของ Netlify มองไม่เห็น ⇒ ขึ้นเว็บแล้วตอบ Cannot find module");
  console.log('   ⇒ ท่าที่ถูก: { load: () => import("../lib/x.mjs") }');
  for (const x of พบ) console.log(`   · ${x.ไฟล์}:${x.บรรทัด}  ${x.ข้อความ}`);
  process.exit(1);
}
console.log(`✅ check-dynamic-imports: ${ไฟล์.length} ไฟล์ใน ${ราก}/ — import() เป็นข้อความคงที่ทุกจุด`);
