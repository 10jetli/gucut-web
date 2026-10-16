// วันที่ของเอกสารทุกชนิด ต้องเป็น **วันไทย** — ห้ามหั่น 10 ตัวจากเวลา UTC ดิบ
//
// 🔴 ของจริง 17 ต.ค. 2569 (ฝั่งจอเทียบบัตรสต็อกกับหน้าสินค้า ZORT ของ 00068):
//    วันเลื่อนหนึ่งวัน **บางแถว** — ZORT 14 ม.ค./5 ม.ค./22 ธ.ค. · เรา 13/4/21 · แถวขายตรง
//    เหตุ: บัตรสต็อกมีสามสาย และ **สายซื้อเป็นตัวเดียวที่ไม่แปลงเป็นวันไทย**
//      ขาย → orderDay() อ่าน orderdateString ✅ · ปรับ → date(at,'+7 hours') ✅
//      ซื้อ → String(p.purchaseorderdate).slice(0,10) = หั่นจาก UTC 🔴
//
// 🔑 อาการของคลาสนี้: **ยอดรวมข้ามหลายวันยังถูก เห็นผิดเฉพาะรายวัน**
//    ⇒ ไม่มีใครเจอจนกว่าจะมีคนเปิดเทียบรายแถวกับระบบต้นทาง
// 🔑 และกับดักที่ลึกกว่า: ไฟล์นั้น **มี `thaiDayFromUtc` import ไว้แล้ว** แต่ช่องข้าง ๆ ยังใช้ UTC
//    ⇒ เอกสารใบเดียวมีสองมาตรฐาน ⇒ ด่านนี้เฝ้า **ทุกสาย** ไม่ใช่เฉพาะสายที่เพิ่งแก้
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync("netlify/lib/core-purchases.mjs", "utf8");
const โค้ด = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("วันของใบซื้อต้องผ่านตัวแปลงวันไทย ไม่ใช่หั่นจาก UTC", () => {
  assert.match(โค้ด, /date: thaiDayFromUtc\(p\?\.purchaseorderdate\)/);
  /* 🚫 ห้ามกลับไปหั่นดิบ — นั่นคือบั๊กตัวจริงที่ฝั่งจอจับได้ */
  assert.ok(!/date: String\(p\?\.purchaseorderdate \?\? ""\)\.slice\(0, 10\)/.test(โค้ด),
    "กลับไปหั่นวันจาก UTC ดิบอีกแล้ว");
});

test("ทุกช่องวันของเอกสารในไฟล์นี้ ต้องไม่หั่นจากช่องที่เป็นเวลาดิบ", () => {
  /* ช่องที่ลงท้าย `date` เฉย ๆ = เวลาดิบของ ZORT (UTC) · ช่องที่ลงท้าย `dateString` = รูปที่ไทยแล้ว
     ⇒ `.slice(0,10)` ใช้ได้กับ *dateString* เท่านั้น · ใช้กับช่องเวลาดิบต้องผ่านตัวแปลง */
    const ต้องสงสัย = [...โค้ด.matchAll(/String\(\s*\w+\??\.(\w*date)\s*\?\?\s*""\s*\)\.slice\(0, 10\)/g)]
      .map((m) => m[1])
      .filter((ช่อง) => !/String$/.test(ช่อง));
  assert.deepEqual(ต้องสงสัย, [],
    `ช่องเวลาดิบถูกหั่นตรง ๆ โดยไม่แปลงเป็นวันไทย: ${ต้องสงสัย.join(" · ")}`);
});

test("ตัวแปลงกลางต้องคืน null เมื่อแปลงไม่ได้ ไม่ใช่วันมั่ว", async () => {
  const { thaiDayFromUtc } = await import("../../netlify/lib/thaiday.mjs");
  assert.equal(thaiDayFromUtc(""), null);
  assert.equal(thaiDayFromUtc(null), null);
  assert.equal(thaiDayFromUtc("ไม่ใช่วัน"), null);
  // วันล้วน ⇒ วันเดิม (ห้ามเลื่อน)
  assert.equal(thaiDayFromUtc("2026-09-14"), "2026-09-14");
  // มีเวลาช่วงเช้าไทย ⇒ ต้องเลื่อนเป็นวันไทยที่ถูก
  assert.equal(thaiDayFromUtc("2026-09-14 17:30:00"), "2026-09-15");
});
