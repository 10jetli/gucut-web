// ต่ออายุ token ล้ม **ต้องส่งเสียง** — ห้ามรายงานว่ารอด
//
// ของจริง 16 ต.ค. 2569 (ฝั่งจอจับได้ระหว่างเทียบจอ "เชื่อมต่อบริการอื่น"):
//   Lazada token หมดอายุ 6 ต.ค. ⇒ **10 วัน** ที่ต่ออายุล้มทุกคืน
//   แต่ `?tokens=1` รายงาน `ok:true connected:true` และจอสถานะขึ้น "เชื่อมแล้ว"
//   ⇒ งานกันตายที่รายงานว่ารอดทุกคืนขณะที่ของตายแล้ว **แย่กว่าไม่มีงานนั้นเลย**
//      เพราะมันกินที่ของการเฝ้าจริง
// 🔑 Shopee/TikTok ไม่เป็น เพราะ validToken ของสองเจ้านั้นปล่อย error ลอยขึ้นไป
//    ⇒ ความต่างอยู่ที่ `catch` ของ Lazada ตัวเดียว
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const lz = fs.readFileSync("netlify/lib/lazada.mjs", "utf8");
const tr = fs.readFileSync("netlify/functions/token-refresh.mjs", "utf8");
const cn = fs.readFileSync("netlify/lib/connections.mjs", "utf8");

test("validToken ของ Lazada ห้ามกลืนเหตุผลที่ต่ออายุล้ม", () => {
  const i = lz.indexOf("export async function validToken()");
  const ก้อน = lz.slice(i, lz.indexOf("\n}", i));
  // 🔴 รูปเดิมที่เป็นต้นเหตุ — ห้ามกลับมา
  assert.ok(!/catch\s*\{\s*\n?\s*return t;/.test(ก้อน), "เจอ `catch { return t }` แบบกลืน error กลับมาอีก");
  assert.match(ก้อน, /catch \(e\)/);
  assert.match(ก้อน, /refreshError:/, "ต้องติดป้ายเหตุผลไปกับ token ที่คืน");
  // ยังต้องคืนตัวเดิมอยู่ (ไม่ตัดขาดทันที ตามเจตนาเดิมของโค้ด)
  assert.match(ก้อน, /\.\.\.t,/);
});

test("งานตามเวลาต้องรายงาน ok:false เมื่อต่ออายุล้ม — และต้องมีขาที่ไม่ขึ้นกับผู้ให้บริการ", () => {
  /* ขา 1 = ผู้ให้บริการติดป้ายเอง · ขา 2 = เวลาเหลือติดลบ (จริงกับทุกเจ้า)
     ถ้ามีแต่ขา 1 เจ้าใหม่ที่ลืมติดป้ายจะเงียบแบบเดิมอีก */
  assert.match(tr, /const ต่ออายุล้ม = t\.refreshError \|\| \(hoursLeft !== null && hoursLeft < 0\)/);
  assert.match(tr, /ok: !ต่ออายุล้ม/);
  // ของเดิมที่เป็นบั๊ก: ok: true ตายตัว
  assert.ok(!/out\[p\.key\] = \{\s*\n\s*ok: true,\s*\n\s*connected: true,\s*\n\s*\/\//.test(tr),
    "ยังมี ok:true ตายตัวในกิ่งที่มี token");
  assert.match(tr, /why: t\.refreshError/);
});

test("จอสถานะห้ามขึ้น connected:true ในคำตอบที่บอกเองว่า token หมดอายุ", () => {
  const i = cn.indexOf("async function lazada()");
  const ก้อน = cn.slice(i, cn.indexOf("\nasync function", i + 10));
  assert.match(ก้อน, /const หมดอายุแล้ว = exp\.tokenExpired === true;/);
  assert.match(ก้อน, /connected: !หมดอายุแล้ว/);
  // ของเดิมที่ขัดกันเอง
  assert.ok(!/connected: true,\s*\n\s*\.\.\.exp,/.test(ก้อน), "ยังมี connected:true คู่กับ ...exp");
  // ต้องบอกทางออกให้คนอ่าน ไม่ใช่แค่บอกว่าแดง
  assert.match(ก้อน, /กดอนุญาตใหม่/);
});

test("สามสถานะยังอยู่ — หมดอายุ=false · ไม่รู้=null ห้ามยุบเป็นสอง", () => {
  const i = cn.indexOf("async function lazada()");
  const ก้อน = cn.slice(i, cn.indexOf("\nasync function", i + 10));
  // ไม่รู้วันหมดอายุ (tokenExpired = null) ต้องไม่ถูกนับเป็นหมดอายุ
  assert.match(ก้อน, /exp\.tokenExpired === true/, "ต้องเทียบ === true ไม่ใช่ truthy — null ต้องไม่ตกเป็นหมดอายุ");
});
