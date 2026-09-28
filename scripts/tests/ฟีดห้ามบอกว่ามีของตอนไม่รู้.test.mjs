/* 🔴 ด่าน: **ฟีดที่ AI อ่าน (/products.json) และฟีดที่จ่ายเงินยิงโฆษณา (/catalog.xml)**
 *    (สเปกฝั่งจอ ข้อ 7 กับ 8 · ใบ t_mu8i1pu1 · 28 ก.ย. 2569)
 *
 * ทั้งสองฟีดเอาโครงจาก `feed-base.json` (สร้างตอน build) + สต็อก/ราคาสดจาก ZORT
 * ความเสียหายถ้าพลาด **ต่างกันคนละทิศ** ⇒ ด่านต้องตรวจคนละข้อ:
 *  · `/products.json` — AI เอาไปบอกลูกค้าว่ามีของ ⇒ ดึงสดไม่ได้ **ต้องประกาศว่าเป็นของเก่า**
 *    ไม่ใช่เสิร์ฟของเก่าเงียบ ๆ (คีย์ `stockSource`: live / cached / baked)
 *  · `/catalog.xml` — **จ่ายเงินค่าคลิกจริง** ⇒ รายการที่ราคาหรือรูปหาย **ต้องถูกตัดออก**
 *    ส่งค่าว่างไปคือโฆษณาที่พาคนไปหน้าเสีย · Google ตัดสิทธิ์บัญชีได้
 *
 * 🔑 ข้อที่ทั้งสองต้องเหมือนกัน: **ทะเบียนใบอนุญาตชนะ ZORT** (ท่านประธานสั่ง 25 ก.ย. 2569)
 *    ถอดออก = เลื่อย 7 รุ่นหายจากฟีดทั้งรุ่น เพราะ ZORT ว่าหมดแต่ทะเบียนมีของ 24 เครื่อง
 * ⚠️ ด่านที่อ่านซอร์สต้องพิมพ์ `ไฟล์:บรรทัด` ที่มันตัดสิน (กติกาที่ตกลงกับฝั่งจอ)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ซอร์สไม่เอาคอมเมนต์, เลขบรรทัด, ปลูกในโค้ด } from "./_src.mjs";
import { ตัดคอมเมนต์ } from "../_strip-comments.mjs";

const Pไฟล์ = "netlify/functions/products-feed.mjs";
const Cไฟล์ = "netlify/functions/catalog-feed.mjs";
const P = ซอร์สไม่เอาคอมเมนต์(Pไฟล์);
const C = ซอร์สไม่เอาคอมเมนต์(Cไฟล์);
const Pดิบ = readFileSync(Pไฟล์, "utf8");
const Cดิบ = readFileSync(Cไฟล์, "utf8");

test("✅ อ่านทั้งสองไฟล์ได้ และเป็นฟีดที่ประกาศ path เอง", () => {
  assert.match(P, /path:\s*"\/products\.json"/, "products-feed ต้องประกาศ path /products.json");
  assert.match(C, /path:\s*"\/catalog\.xml"/, "catalog-feed ต้องประกาศ path /catalog.xml");
});

/* ══════════ ข้อ 7 — /products.json ══════════ */

test("🔴 ดึงสต็อกสดไม่ได้ ⇒ ต้อง **ประกาศที่มา** ไม่ใช่เสิร์ฟของเก่าเงียบ ๆ", () => {
  const i = P.indexOf("stockSource:");
  assert.ok(i > 0, "ไม่เจอคีย์ stockSource — ถอดออกแล้ว AI จะแยก 'สด' จาก 'ของเก่า' ไม่ได้เลย");
  console.log(`   🔎 ${Pไฟล์}:${เลขบรรทัด(P, i)} ประกาศที่มาของสต็อก`);
  const บรรทัด = P.slice(i, P.indexOf("\n", i));
  for (const ค่า of ["baked", "cached", "live"])
    assert.ok(บรรทัด.includes(ค่า), `ต้องแยกสถานะ "${ค่า}" ได้ · ได้: ${บรรทัด.trim()}`);
  /* 🔑 สามสถานะ ไม่ใช่สองสถานะ — `!map` (ใช้ค่าที่แช่ตอน build) ต่างจาก `stale` (ของเก่าที่เคยกวาด) */
  assert.match(บรรทัด, /!map \? "baked" : stale \? "cached" : "live"/,
    "ลำดับต้องเป็น ไม่มี map ⇒ baked ก่อน แล้วค่อยดู stale — สลับลำดับ = ของที่ไม่มีเลยจะถูกเรียกว่า cached");
  assert.match(P, /stockLive: !stale && !!map/,
    "คีย์เดิม `stockLive` ต้องคงไว้เพื่อผู้อ่านเดิม — และต้องเป็น false ทั้งตอน stale และตอนไม่มี map");
});

test("🔴 ของหมดต้องไม่เข้าฟีด และ **ทะเบียนชนะ ZORT**", () => {
  const i = P.indexOf("if (!(st > 0)) continue;");
  assert.ok(i > 0, "ไม่เจอด่านตัดของหมด — หายแล้ว AI จะแนะนำของที่ขายไม่ได้");
  console.log(`   🔎 ${Pไฟล์}:${เลขบรรทัด(P, i)} ตัดของหมดออกจากฟีด`);
  const j = P.indexOf("const lic = licensedStock(");
  assert.ok(j > 0 && j < i, "ต้องอ่านทะเบียน **ก่อน** ด่านตัดของหมด ไม่งั้นเลื่อยหายทั้งรุ่น");
  assert.match(P, /const st = lic !== null \? lic : live \? live\[0\] : p\.st/,
    "ลำดับต้องเป็น ทะเบียน → ZORT → ค่าที่แช่ไว้ · `lic !== null` ห้ามเป็น `lic ||` (0 เครื่องคือคำตอบที่ถูกต้อง)");
});

test("🔑 `lic !== null` ห้ามกลายเป็น truthy-check — ทะเบียนที่บอกว่า 'หมด' (0) ต้องมีผล", () => {
  /* ถ้าเขียน `lic || live[0]` ⇒ ทะเบียนที่บอก 0 (ขายไปแล้ว) จะถูกข้าม แล้วไปเชื่อ ZORT ที่ว่ายังมี
     ⇒ ฟีดโฆษณาจะยิงของที่ขายไปแล้ว (มีซีเรียลจริง 3 ตัวที่พิสูจน์แล้วว่า ZORT ผิด) */
  for (const [ชื่อ, s] of [["products-feed", P], ["catalog-feed", C]])
    assert.ok(!/lic \|\|/.test(s), `${ชื่อ}: เจอ \`lic ||\` ⇒ ทะเบียนที่บอกว่าหมดจะไม่มีผล`);
});

/* ══════════ ข้อ 8 — /catalog.xml (ฟีดที่จ่ายเงิน) ══════════ */

test("🔴 ราคาหรือรูปหาย ⇒ **ตัดออก** ไม่ใช่ส่งค่าว่าง (ค่าว่าง = โฆษณาที่พาไปหน้าเสีย)", () => {
  const i = C.indexOf("if (!p?.sku || !p?.t || !p?.img || !p?.h) continue;");
  assert.ok(i > 0, "ไม่เจอด่านคัดรายการที่ข้อมูลไม่ครบ");
  console.log(`   🔎 ${Cไฟล์}:${เลขบรรทัด(C, i)} คัดรายการที่ข้อมูลไม่ครบ`);
  const j = C.indexOf("if (!(st > 0) || !(price > 0)) continue;");
  assert.ok(j > i, "ต้องมีด่านราคา > 0 ด้วย — ราคา 0 ในฟีด Google คือรายการที่ถูกปฏิเสธ/ทำให้บัญชีเสี่ยง");
  console.log(`   🔎 ${Cไฟล์}:${เลขบรรทัด(C, j)} ตัดของหมด/ไม่มีราคา`);
  /* ต้องตัด **ก่อน** สร้าง <item> ⇒ ไม่มีทางที่รายการไม่ครบจะหลุดออกไป */
  const k = C.indexOf("<g:id>");
  assert.ok(k > j, "ด่านทั้งสองต้องอยู่ก่อนการสร้าง <item> ไม่ใช่กรองทีหลัง");
});

test("🚫 ห้ามใส่ `g:gtin` — สินค้าโรงงานเราเอง ใส่มั่วโดนแบนฟีด", () => {
  assert.ok(!/g:gtin/.test(C), "เจอ g:gtin ⇒ ต้องเอาออก (เกณฑ์ Google: มี 2 ใน 3 ของ gtin/mpn/brand)");
  assert.match(C, /<g:mpn>/, "ต้องส่ง mpn (= SKU)");
  assert.match(C, /<g:brand>/, "ต้องส่ง brand");
});

test("🔑 ทุกช่องข้อความต้องผ่าน `esc()` — ชื่อสินค้าไทยมี & กับ \" ได้ ⇒ XML พังทั้งไฟล์", () => {
  const i = C.indexOf("<g:id>");
  const ก้อน = C.slice(i, C.indexOf("</item>", i));
  const ช่องข้อความ = [...ก้อน.matchAll(/<(g:)?(id|title|description|link|image_link|brand|mpn)>\$\{([^}]+)\}/g)];
  assert.ok(ช่องข้อความ.length >= 6, `คาดว่ามีช่องข้อความหลายช่อง · เจอ ${ช่องข้อความ.length}`);
  for (const m of ช่องข้อความ)
    assert.match(m[3], /^esc\(/, `ช่อง <${m[1] ?? ""}${m[2]}> ไม่ผ่าน esc() · ได้: ${m[3]}`);
  console.log(`   🔎 ตรวจช่องข้อความใน <item> ${ช่องข้อความ.length} ช่อง — ผ่าน esc() ครบ`);
});

test("🔑 `esc()` ต้องหนี 4 ตัวอักษรที่ทำ XML พัง (เรียกของจริง ไม่ใช่อ่านซอร์ส)", async () => {
  /* ยกสูตรจากซอร์สมาเรียก — ไฟล์นี้ไม่ export esc */
  const m = C.match(/const esc = \(s\) =>\s*([\s\S]*?);\n/);
  assert.ok(m, "ยกสูตร esc จากซอร์สไม่ได้");
  // eslint-disable-next-line no-new-func
  const esc = new Function(`"use strict"; return ((s) => ${m[1].trim()});`)();
  assert.equal(esc('ใบมีด 16" & โซ่ <ของแท้>'), "ใบมีด 16&quot; &amp; โซ่ &lt;ของแท้&gt;");
  assert.equal(esc(null), "", "null ⇒ สตริงว่าง ไม่ใช่ 'null'");
  assert.equal(esc(undefined), "", "undefined ⇒ สตริงว่าง");
  /* 🔑 `&` ต้องถูกแทนก่อนตัวอื่น ไม่งั้น `&lt;` จะกลายเป็น `&amp;lt;` */
  assert.equal(esc("<a>"), "&lt;a&gt;", "ลำดับการแทนต้องไม่ทำให้เอนทิตีถูกหนีซ้ำ");
});

/* ══════════ ตัวควบคุมลบ — ปลูกในโค้ด แล้วเกณฑ์ต้องจับได้ ══════════ */

test("🧪 ตัวควบคุม: ถอดด่านราคาออกจากฟีดโฆษณา ⇒ เกณฑ์ต้องจับได้", () => {
  const { ปลูก, บรรทัด } = ปลูกในโค้ด(
    Cดิบ,
    "if (!(st > 0) || !(price > 0)) continue;",
    "if (!(st > 0)) continue;",
    { ไฟล์: Cไฟล์ }
  );
  console.log(`   🌱 ปลูกในโค้ดบรรทัด ${บรรทัด}`);
  const โค้ดปลูก = ตัดคอมเมนต์(ปลูก, Cไฟล์, { คงเลขบรรทัด: true });
  assert.ok(!โค้ดปลูก.includes("if (!(st > 0) || !(price > 0)) continue;"),
    "ปลูกแล้วด่านราคาต้องหายจากโค้ด ⇒ เกณฑ์ข้างบนจะแดง");
});

test("🧪 ตัวควบคุม: เอา esc() ออกจากช่อง title ⇒ เกณฑ์ต้องจับได้", () => {
  const { ปลูก, บรรทัด } = ปลูกในโค้ด(
    Cดิบ,
    "`<title>${esc(String(p.t).slice(0, 150))}</title>`",
    "`<title>${String(p.t).slice(0, 150)}</title>`",
    { ไฟล์: Cไฟล์ }
  );
  console.log(`   🌱 ปลูกในโค้ดบรรทัด ${บรรทัด}`);
  const โค้ดปลูก = ตัดคอมเมนต์(ปลูก, Cไฟล์, { คงเลขบรรทัด: true });
  const m = โค้ดปลูก.match(/<title>\$\{([^}]+)\}/);
  assert.ok(m && !m[1].startsWith("esc("), "ปลูกแล้ว title ต้องไม่ผ่าน esc ⇒ เกณฑ์ข้างบนจะแดง");
});

test("🧪 ตัวควบคุม: เปลี่ยน stockSource เป็นสองสถานะ ⇒ เกณฑ์ต้องจับได้", () => {
  const { ปลูก, บรรทัด } = ปลูกในโค้ด(
    Pดิบ,
    '!map ? "baked" : stale ? "cached" : "live"',
    'stale ? "cached" : "live"',
    { ไฟล์: Pไฟล์ }
  );
  console.log(`   🌱 ปลูกในโค้ดบรรทัด ${บรรทัด}`);
  const โค้ดปลูก = ตัดคอมเมนต์(ปลูก, Pไฟล์, { คงเลขบรรทัด: true });
  assert.ok(!/"baked"/.test(โค้ดปลูก), "ปลูกแล้วสถานะ baked ต้องหาย ⇒ เกณฑ์ข้างบนจะแดง");
});
