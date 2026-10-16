// `?list=deadstock` — จุดตัดแบบเดือนปฏิทิน + ลำดับวันขายล่าสุด (ให้ตรงกับจอ ZORT)
//
// ที่มา: ฝั่งจอวัดจอจริง /Dashboard/ProductReport 16 ต.ค. 2569 ช่วง 3 เดือน แล้วเจอ 3 ข้อ
//   ② จุดตัด: ZORT ตัดที่ 16 ก.ค. (วันเดียวกันของ 3 เดือนก่อน) · ของเรา days=90 ตัดที่ 18 ก.ค.
//   ③ ลำดับ: ZORT เรียงวันขายล่าสุด ใหม่→เก่า · ของเราเรียงมูลค่ามาก→น้อย
// 🔑 คลาสเดิมที่เคยกัด `?monthly=` และ `?bycustomer=`: **เดือนปฏิทิน ≠ เดือน × 30 วัน**
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ถอยเดือนปฏิทิน } from "../../netlify/lib/core-stock.mjs";

test("ถอย 3 เดือนจาก 16 ต.ค. ต้องได้ 16 ก.ค. — เลขที่ฝั่งจออ่านจากจอ ZORT จริง", () => {
  assert.equal(ถอยเดือนปฏิทิน("2026-10-16", 3), "2026-07-16");
  // ถ้าใครเปลี่ยนกลับไปใช้ 90 วัน จะได้ 2026-07-18 ⇒ ข้อนี้แดงทันที
  assert.notEqual(ถอยเดือนปฏิทิน("2026-10-16", 3), "2026-07-18");
});

test("วันที่ 31 ถอยไปเดือนที่ไม่มีวันที่ 31 ต้องหนีบเป็นวันสุดท้าย ห้ามเด้งข้ามเดือน", () => {
  /* 🔴 นี่คือข้อที่พลาดแล้ว **จุดตัดขยับไปข้างหน้า** แล้วรายการจมหายไปหลายแถว
     โดยยอดรวมยังดูสมเหตุสมผลทุกประการ */
  assert.equal(ถอยเดือนปฏิทิน("2026-03-31", 1), "2026-02-28");
  assert.equal(ถอยเดือนปฏิทิน("2026-05-31", 1), "2026-04-30");
  // ข้ามปีต้องถอยปีให้ถูกด้วย
  assert.equal(ถอยเดือนปฏิทิน("2026-01-31", 1), "2025-12-31");
  assert.equal(ถอยเดือนปฏิทิน("2026-10-16", 12), "2025-10-16");
});

const src = fs.readFileSync("netlify/lib/core-stock.mjs", "utf8");
const i = src.indexOf("export async function listDeadStock");
/* 🔑 หน้าต่างต้องคลุม **ทั้งฟังก์ชัน** — ของเดิมตั้งเลขไว้ 7000 แล้วข้อสุดท้ายแดง
   เพราะ `excludedCandidates` อยู่ที่ระยะ 8,872 · เลขที่เดาเอาจะพาไปสรุปว่า "โค้ดไม่มี"
   ⇒ หาขอบท้ายจากหัวฟังก์ชันถัดไป ไม่ใช่จากตัวเลขที่ฝังไว้ */
const จบ = src.indexOf("/** สต็อกการ์ดรายสินค้า", i);
const ก้อน = src.slice(i, จบ > i ? จบ : undefined);

test("ลำดับความสำคัญของจุดตัด และต้องประกาศว่าใช้ตัวไหน", () => {
  // before > months > days · และ cutFrom ต้องบอกตรง ๆ ไม่ให้จอเดา
  assert.match(ก้อน, /const cut = beforeRaw[\s\S]{0,200}months[\s\S]{0,200}days \* 864e5/);
  assert.match(ก้อน, /cutFrom/);
  assert.match(src, /cutFrom, \/\//);
});

test("ค่าผิดรูปต้องตีกลับ ห้ามถอยไปใช้ days เงียบ ๆ", () => {
  assert.match(ก้อน, /before ต้องเป็นวันจริงรูป YYYY-MM-DD/);
  assert.match(ก้อน, /months ต้องเป็นจำนวนเดือนเต็ม/);
  assert.match(ก้อน, /sort รับได้เฉพาะ/);
  // เส้นต้องแปลง error เป็น 400 ไม่ใช่ 200 + ok:true
  const core = fs.readFileSync("netlify/functions/core.mjs", "utf8");
  assert.match(core, /if \(typeof ผลจม\?\.error === "string" && ผลจม\.error\) return json\(\{ ok: false, \.\.\.ผลจม \}, 400\)/);
});

test("ทุกแบบการเรียงต้องมีตัวตัดสินเสมอกัน — ไม่งั้นแบ่งหน้าได้แถวซ้ำ/หาย", () => {
  const m = ก้อน.match(/const เรียงได้ = \{([\s\S]*?)\};/);
  assert.ok(m, "ไม่เจอทะเบียนลำดับ");
  for (const [, นิพจน์] of [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x)) {
    assert.ok(/cur\.sku\s*$/.test(นิพจน์), `ลำดับนี้ไม่มีตัวตัดสินเสมอกันท้ายสุด: ${นิพจน์}`);
  }
  // ของที่ไม่เคยขายเลยต้องอยู่ท้าย ไม่ใช่กองบนสุด
  assert.match(m[1], /s\.last_sold IS NULL, s\.last_sold DESC/);
});

test("ก้อนวัดเหตุส่วนต่าง: ห้ามบวกเข้า total และห้ามเขียนเลขของจอ ZORT ไว้ในท่อ", () => {
  assert.match(ก้อน, /excludedCandidates/);
  for (const k of ["qtyNotPositive", "serviceType", "productsWithoutSnapshot"]) assert.match(ก้อน, new RegExp(k));
  assert.match(ก้อน, /ห้ามบวกเข้า total/);
  /* 🔴 เลขที่อ่านจากจอคนอื่นต้องไม่ถูกฝังในโค้ด — มันตายในไม่กี่ชั่วโมง (card-numbers-expire)
     ท่อส่งแต่กองที่ตัวเองตัดออก แล้วให้คนเทียบ */
  assert.ok(!/1,?9[0-9][0-9]/.test(ก้อน.replace(/\/\*[\s\S]*?\*\//g, "")),
    "ห้ามฝังจำนวนที่อ่านจากจอ ZORT ไว้ในโค้ดที่ทำงาน");
});
