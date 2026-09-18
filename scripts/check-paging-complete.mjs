#!/usr/bin/env node
/* แบ่งหน้าครบไหม — ไล่หน้าจริงแล้วดูว่า **ไม่ซ้ำ ไม่ข้าม และจบตรงกับ total**
 * ใบ t_mu2pekwt (ท่านประธานสั่ง 15 ก.ย. 2569: "เทียบทุกจุด ทีละหน้า กดเข้าไปลึก ๆ")
 *
 * 🔴 ทำไมต้องมีด่านนี้: แบ่งหน้าพลาดแล้ว **คนเห็นข้อมูลไม่ครบโดยไม่มีอะไรฟ้อง**
 *    · แถวซ้ำข้ามหน้า ⇒ คนนับยอดเองจะได้เลขเกิน
 *    · แถวหายระหว่างหน้า ⇒ ของที่ต้องจัดการหลุดไปเงียบ ๆ (เจ็บที่สุด)
 *    · จบไม่ตรง total ⇒ คนกดหน้าสุดท้ายแล้วเชื่อว่าเห็นครบ
 *    ฝั่งจอกดปุ่ม "หน้าถัดไป" ครบ 10 จอแล้ว (19 ก.ย.) **แต่เขากดได้แค่หน้า 1→2**
 *    ⇒ ฝั่งท่อต้องไล่ให้ครบกว่านั้น และตรวจสิ่งที่ตากดไม่เห็น (ซ้ำ/ข้าม)
 *
 * วิธี: ไล่ทีละหน้าด้วย `nextOffset`/`nextPage` **ที่ท่อบอกมา ไม่บวกเลขเอง**
 *   (กติกาของ paging-hint: "เดินหน้าด้วยค่านี้เท่านั้น ห้ามบวก limit ที่ขอไปเอง"
 *    เพราะเส้นที่บีบเพดานจะทำให้การบวกเองข้ามแถว)
 *
 * ⚠️ **เกณฑ์ผ่านสามข้อ ต้องครบทั้งสาม**
 *   ① ไม่มีกุญแจแถวซ้ำข้ามหน้า  ② จำนวนที่เก็บได้ = ผลรวมที่ท่อบอกต่อหน้า (ไม่หายกลางทาง)
 *   ③ ท่อประกาศจบเอง (`pagingDone`) ตรงกับตอนที่แถวหมดจริง
 * ⚠️ **ไม่ไล่ทั้งชุด** — เส้นที่มีหลายหมื่นแถวจะกินเวลาและโควตา ⇒ ไล่ `เพดานหน้า` หน้าแรก
 *    ⇒ ผลคือ "ไม่เจอปัญหาในช่วงที่ไล่" **ไม่ใช่ "แบ่งหน้าถูกทั้งชุด"** — พิมพ์ขอบเขตติดไปเสมอ
 * ⚠️ เส้นที่ไม่มีกุญแจแถว (`id`/`sku`/`number`) ⇒ **ตัดสินไม่ได้** ไม่ใช่ผ่าน
 *    (ตรวจแถวซ้ำโดยไม่มีกุญแจ = เทียบเนื้อแถว ซึ่งทำเหตุการณ์จริงที่ซ้ำเนื้อหายไป)
 *
 * 🚫 GET เท่านั้น อ่านอย่างเดียว
 * รัน: node scripts/check-paging-complete.mjs [--base https://gucut.com] [--pages 4]
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ราก = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARG = process.argv.slice(2);
const หลัง = (ชื่อ) => (ARG.includes(ชื่อ) ? ARG[ARG.indexOf(ชื่อ) + 1] : null);
const BASE = (หลัง("--base") || "").startsWith("http") ? หลัง("--base") : "https://gucut.com";
const เพดานหน้า = Math.max(2, Math.min(10, Number(หลัง("--pages")) || 4));
const ต่อหน้า = 5;

const คีย์ไฟล์ = join(homedir(), ".gucut-admin-key");
if (!existsSync(คีย์ไฟล์)) {
  console.error(`❌ ไม่มี ${คีย์ไฟล์} — นี่คือ "ยังไม่ได้ตรวจ" ไม่ใช่ "ผ่าน"`);
  process.exit(1);
}
const KEY = readFileSync(คีย์ไฟล์, "utf8").trim();
const บังคับ = { stockcard: { sku: "00023-24NW" }, bundleitems: { sku: "00023-24NW" } };

async function ยิง(qs) {
  try {
    const res = await fetch(`${BASE}/api/core?${qs}`, { headers: { "x-admin-key": KEY }, signal: AbortSignal.timeout(45000) });
    const t = await res.text();
    try { return { http: res.status, data: JSON.parse(t) }; } catch { return { http: res.status, ผิดรูป: t.slice(0, 70) }; }
  } catch (e) { return { ยิงไม่ถึง: String(e?.message || e).slice(0, 80) }; }
}
const แถวของ = (d) => {
  for (const k of ["rows", "items", "lines"]) if (Array.isArray(d?.[k])) return d[k];
  return null;
};
/* กุญแจแถว — ไม่มีเลย = ตัดสินไม่ได้ (ไม่เทียบเนื้อแถว)
   🔴 **ห้ามใช้ `sku` เดี่ยวเป็นกุญแจ** (แก้ 19 ก.ย. 2569 — ด่านให้ธงลวง 2 เส้นเพราะข้อนี้)
      `list=channel-gaps` แถวหนึ่งคือ **(รหัส × ช่องทาง)** ⇒ รหัสเดียวโผล่หลายแถวโดยถูกต้อง
      (ยิงดูเองแล้ว: offset=0 ได้ ['03058','03058','00817'] ⇒ ซ้ำใน**หน้าเดียวกัน** ไม่ใช่ข้ามหน้า)
      ⇒ ด่านอ่านว่า "แถวซ้ำข้ามหน้า" ทั้งที่ข้อมูลถูก
   ⇒ `id` ยังใช้เดี่ยวได้ (เป็นกุญแจจริง) · `sku` ต้องประกอบกับช่องที่แยกแถว
   🔑 กฎ: **กุญแจของด่านต้องเป็นกุญแจของข้อมูลจริง ไม่ใช่ชื่อที่ดูเหมือนกุญแจ** */
const ช่องประกอบ = ["channel", "platform", "store", "source", "warehouse", "line", "day", "date", "kind", "reason"];
const กุญแจ = (r) => {
  if (r?.id !== undefined && r.id !== null && r.id !== "") return `id:${r.id}`;
  for (const k of ["sku", "number", "order_sn", "tid"]) {
    if (r?.[k] === undefined || r[k] === null || r[k] === "") continue;
    const เพิ่ม = ช่องประกอบ.filter((c) => r[c] !== undefined && r[c] !== null && r[c] !== "").map((c) => `${c}=${r[c]}`);
    return `${k}:${r[k]}${เพิ่ม.length ? "|" + เพิ่ม.join("|") : ""}`;
  }
  return null;
};

/* ── ตัวควบคุม ── */
const ค1 = await ยิง("list=เส้นที่ไม่มีจริง-zzz");
if (!ค1.data?.accepts) { console.error("❌ ตัวควบคุม: เส้นมั่วไม่ได้คำตอบ 'ไม่รู้จัก' ⇒ อ่านผิดที่ ทิ้งผลรอบนี้"); process.exit(1); }
const ค2 = await fetch(`${BASE}/api/core?list=orders&limit=1`).then((r) => r.status).catch(() => 0);
if (ค2 === 200) { console.error("❌ ตัวควบคุม: ไม่ส่งรหัสแล้วได้ 200 ⇒ ด่านรหัสไม่ทำงาน หยุด"); process.exit(1); }

const สารบัญ = join(ราก, "netlify", "lib", "returned-fields.mjs");
if (!existsSync(สารบัญ)) { console.error("❌ ไม่มี returned-fields.mjs — รัน gen-returned-fields.mjs ก่อน"); process.exit(1); }
const { catalogue } = await import(สารบัญ);

const ปัญหา = [], ตัดสินไม่ได้ = [];
let ผ่าน = 0;
for (const เส้น of Object.keys(catalogue.เส้น)) {
  const พารา = { list: เส้น, limit: String(ต่อหน้า), ...(บังคับ[เส้น] || {}) };
  let r = await ยิง(new URLSearchParams(พารา).toString());
  let d = r.data;
  const แถว1 = แถวของ(d);
  if (!Array.isArray(แถว1)) { continue; }                                  // ไม่ใช่เส้นรายการ
  if (!แถว1.length) { ตัดสินไม่ได้.push(`${เส้น}: หน้าแรกว่าง ⇒ ไล่หน้าไม่ได้ (ไม่ใช่ "แบ่งหน้าถูก")`); continue; }
  if (!กุญแจ(แถว1[0])) { ตัดสินไม่ได้.push(`${เส้น}: แถวไม่มีกุญแจ (id/sku/number) ⇒ ตรวจแถวซ้ำไม่ได้`); continue; }

  const เห็น = new Set();
  let เก็บได้ = 0, หน้า = 0, จบเอง = false, ซ้ำ = [];
  while (หน้า < เพดานหน้า) {
    const แถว = แถวของ(d) || [];
    for (const row of แถว) {
      const k = กุญแจ(row);
      if (k === null) continue;
      if (เห็น.has(k)) ซ้ำ.push(k);
      เห็น.add(k);
      เก็บได้++;
    }
    หน้า++;
    /* เดินหน้าด้วยค่าที่ท่อบอก **ห้ามบวกเอง** (กติกาของ paging-hint) */
    const no = d?.nextOffset, np = d?.nextPage;
    if (d?.pagingDone === true || (no === null && np === null)) { จบเอง = true; break; }
    if (Number.isFinite(no)) r = await ยิง(new URLSearchParams({ ...พารา, offset: String(no) }).toString());
    else if (Number.isFinite(np)) r = await ยิง(new URLSearchParams({ ...พารา, page: String(np) }).toString());
    else { ตัดสินไม่ได้.push(`${เส้น}: ไม่บอกทางไปหน้าถัดไป (ไม่มี nextOffset/nextPage/pagingDone)`); break; }
    d = r.data;
    if (!d) { ปัญหา.push(`${เส้น}: หน้า ${หน้า + 1} ยิงไม่สำเร็จ`); break; }
  }
  /* 🔴 **แยกสองอาการให้ชัด** — ข้อความต่างกันเพราะทางแก้ต่างกัน
     (ก) มีป้ายบอกทาง (`nextOffset`/`nextPage`) **แต่ไล่แล้วได้แถวเดิม** ⇒ ท่อชวนให้ไล่หน้าที่ไล่ไม่ได้
         = คลาส `topproducts` (แก้ 19 ก.ย. 2569) · เกิดเพราะ `paging-hint` เติมป้ายให้ทุกเส้นที่มีแถว
           โดยไม่รู้ว่าเส้นนั้นรับ offset/page ไหม ⇒ ทางแก้: ให้เส้นนั้นรับจริง หรือไม่ต้องติดป้าย
     (ข) ไม่มีป้าย แต่แถวซ้ำ ⇒ เป็นเรื่องข้อมูล/ลำดับ ไม่ใช่เรื่องป้าย
     ⚠️ ฝั่งจอเจอว่าธงแดงของเขา 4 ตัวเป็นเท็จทั้งหมด เพราะ **ยิงด้วยชื่อที่เส้นนั้นไม่เคยรับ**
        (`quotations`/`returnorders` แบ่งหน้าด้วย `page=` มาแต่ไหนแต่ไร)
        ⇒ ด่านนี้เดินด้วยป้ายที่ท่อบอกเองอยู่แล้ว จึงไม่ตกหลุมเดียวกัน — เขียนไว้กันคนมาเปลี่ยนวิธี */
  const มีป้าย = Number.isFinite(d?.nextOffset) || Number.isFinite(d?.nextPage);
  if (ซ้ำ.length && มีป้าย && ซ้ำ.length >= เก็บได้ / 2) {
    ปัญหา.push(`${เส้น}: **ติดป้ายบอกทางไปหน้าถัดไป แต่ไล่แล้วได้แถวเดิม ${ซ้ำ.length}/${เก็บได้}** ⇒ ท่อชวนให้ไล่หน้าที่ไล่ไม่ได้ (คลาส topproducts) ⇒ ให้เส้นนั้นรับ offset/page จริง หรือไม่ต้องติดป้าย`);
    continue;
  }
  if (ซ้ำ.length) { ปัญหา.push(`${เส้น}: **แถวซ้ำข้ามหน้า ${ซ้ำ.length} แถว** (เช่น ${ซ้ำ[0]}) ⇒ คนนับยอดเองจะได้เลขเกิน`); continue; }
  if (เก็บได้ !== เห็น.size) { ปัญหา.push(`${เส้น}: เก็บ ${เก็บได้} แถว แต่กุญแจไม่ซ้ำ ${เห็น.size} ⇒ ขัดกันเอง`); continue; }
  const total = Number.isFinite(d?.total) ? d.total : null;
  if (จบเอง && total !== null && เห็น.size !== total && total <= เพดานหน้า * ต่อหน้า)
    { ปัญหา.push(`${เส้น}: ท่อบอกจบแล้ว แต่ได้ ${เห็น.size} แถว ทั้งที่ total = ${total}`); continue; }
  ผ่าน++;
  console.log(`   ✅ ${เส้น}: ไล่ ${หน้า} หน้า · ${เห็น.size} แถวไม่ซ้ำ${จบเอง ? " · ท่อประกาศจบเอง" : ` · ยังไม่จบ (ชนเพดาน ${เพดานหน้า} หน้า)`}`);
}

console.log(`\ncheck-paging-complete: ผ่าน ${ผ่าน} เส้น`);
console.log(`⚠️ ขอบเขต: ไล่แค่ ${เพดานหน้า} หน้าแรก (${ต่อหน้า} แถว/หน้า) ⇒ "ไม่เจอปัญหาในช่วงที่ไล่" ไม่ใช่ "แบ่งหน้าถูกทั้งชุด"`);
if (ตัดสินไม่ได้.length) {
  console.log(`⏸️  ตัดสินไม่ได้ ${ตัดสินไม่ได้.length} (ไม่นับเป็นผ่าน):`);
  for (const x of ตัดสินไม่ได้) console.log(`   · ${x}`);
}
if (ปัญหา.length) {
  console.log(`\n🔴 แบ่งหน้ามีปัญหา ${ปัญหา.length} เส้น — คนจะเห็นข้อมูลไม่ครบโดยไม่มีอะไรฟ้อง`);
  for (const x of ปัญหา) console.log(`   · ${x}`);
}
process.exit(ปัญหา.length ? 1 : 0);
