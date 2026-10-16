// `paystatus` — รับหลายค่า และตีกลับค่าที่ร้านไม่เคยมี
//
// ที่มา: ฝั่งจอยิงจับได้ 16 ต.ค. 2569 ตอนทำการ์ด /Dashboard/Initial ของ ZORT
//   การ์ด "ค้างชำระเงิน" = Pending + Partial Payment ⇒ ต้องส่งสองค่าในคำขอเดียว
//   ของเดิม `pay_status = ?` กับสตริง "Pending,Partial Payment" ⇒ **200 total 0 เงียบ ๆ**
//   ⇒ เขาต้องยิงสองคำขอแล้วบวกเอง (~7 วิต่อการเปิดจอ) และไม่มีอะไรบอกว่าท่อไม่รองรับ
//
// 🔑 เทสนี้อ่าน **ซอร์สของ SQL ที่ประกอบจริง** ไม่ใช่ยิงเว็บ — ของจริงบนเว็บเปลี่ยนตามข้อมูลร้าน
//    แต่ "ส่งสองค่าแล้วต้องได้ IN สองช่อง" เป็นกติกาที่เปลี่ยนเมื่อมีคนตั้งใจเปลี่ยนเท่านั้น
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/lib/core-orders.mjs", "utf8");

test("payStatus ต้องแตกหลายค่าเป็น IN ไม่ใช่เทียบสตริงทั้งก้อน", () => {
  // 🔴 ของเดิมที่เป็นบั๊ก — ห้ามกลับมา
  assert.ok(
    !/where\.push\(\s*["']pay_status = \?["']\s*\)/.test(src),
    "เจอ `pay_status = ?` แบบค่าเดียวกลับมาอีก ⇒ paystatus หลายค่าจะเงียบอีกรอบ",
  );
  const บรรทัด = src.split("\n").filter((l) => l.includes("pay_status IN ("));
  assert.equal(บรรทัด.length, 1, "ต้องประกอบ IN ที่เดียว (buildWhere) ไม่งั้นสองเส้นเพี้ยนออกจากกัน");
  // ต้องใช้ตัวแตกค่าตัวเดียวกับ status — สองช่องที่ตอบคำถามแบบเดียวกันต้องรับค่ารูปเดียวกัน
  assert.match(src, /const payStatuses = statusValues\(payStatus\);/);
});

test("ตัวแตกค่าเป็นตัวเดียวกับที่ status ใช้ — ไม่ใช่ของลอกมาตัวที่สอง", async () => {
  const { statusValues } = await import("../../netlify/lib/core-orders.mjs");
  assert.deepEqual(statusValues("Pending,Partial Payment"), ["Pending", "Partial Payment"]);
  assert.deepEqual(statusValues("Pending"), ["Pending"]);
  assert.deepEqual(statusValues(" Pending , Pending "), ["Pending"]); // ซ้ำต้องยุบ
  assert.equal(statusValues(""), null);                               // ว่าง = ไม่กรอง ไม่ใช่กรองด้วยค่าว่าง
  assert.equal(statusValues(null), null);
});

test("ด่านตีกลับค่าที่ร้านไม่เคยมี ต้องผูกกับรายชื่อจริง และต้องไม่ตัดสินตอนอ่านรายชื่อไม่ได้", () => {
  const i = src.indexOf("const payStatusesWanted");
  assert.ok(i > 0, "ไม่เจอด่านตีกลับ paystatus");
  const ก้อน = src.slice(i, i + 1200);
  // 🔑 เกณฑ์ต้องมาจาก payStatusesAllRows (ค่าที่มีจริง) **ห้ามเป็นรายชื่อที่เขียนตายไว้ในโค้ด**
  //    รายชื่อตายตัวจะค้างทันทีที่ ZORT เพิ่มสถานะใหม่ แล้วด่านจะตีกลับของที่ถูกต้อง
  assert.match(ก้อน, /payStatusesAllRows/);
  // ⚠️ อ่านรายชื่อไม่ได้ ⇒ ข้ามด่าน ไม่ใช่ตีกลับ — "ยังไม่รู้" ห้ามกลายเป็น "ไม่ผ่าน"
  assert.match(ก้อน, /Array\.isArray\(payStatusesAllRows\)/);
  /* 🔴 ข้อที่เทส `orders-advanced` จับได้ตอนเขียนด่านนี้: `[]` ต้องไม่ตัดสินด้วย
     รายชื่อว่าง = ร้านยังไม่มีใบสักใบ (ซิงก์รอบแรกยังไม่จบ) ⇒ ตัดสินตอนนั้นจะตีกลับ **ทุกค่า**
     ทั้งที่คำตอบที่ถูกคือ 0 ใบ ⇒ ด่านต้องเรียกร้อง "มีรายชื่อให้เทียบ" ไม่ใช่แค่ "อ่านได้" */
  assert.match(ก้อน, /&&\s*payStatusesAllRows\.length/);
  assert.match(ก้อน, /return \{\s*\n?\s*error:/);
});

test("เส้น list=orders ต้องเปลี่ยน error เป็น 400 — ไม่ใช่ 200 ที่มี ok:true", () => {
  const route = fs.readFileSync("netlify/functions/core.mjs", "utf8");
  const i = route.indexOf('if (p.get("list") === "orders") {');
  assert.ok(i > 0);
  const ก้อน = route.slice(i, i + 3200);
  assert.match(ก้อน, /if \(orders\?\.error\) return json\(\{ ok: false, [^}]*\}, 400\);/);
  // ลำดับสำคัญ: ด่านต้องอยู่ **ก่อน** บรรทัดที่ตอบ 200 ไม่งั้นมันไม่เคยถูกเรียก
  assert.ok(
    ก้อน.indexOf("orders?.error") < ก้อน.indexOf("return json({ ok: true, ...orders, channels })"),
    "ด่าน 400 ต้องอยู่ก่อนบรรทัดตอบ 200",
  );
});

test("เส้น orderfacets ต้องเขียนกำกับว่า **ไม่มี** ด่านตีกลับ", () => {
  // ความเงียบของเส้นที่ไม่มีด่าน อ่านได้ว่า "ตรวจแล้วผ่าน" ซึ่งไม่จริง ⇒ ต้องประกาศขอบเขตตัวเอง
  assert.match(src, /payStatusValuesNote:[^\n]*ไม่ตีกลับ/);
});
