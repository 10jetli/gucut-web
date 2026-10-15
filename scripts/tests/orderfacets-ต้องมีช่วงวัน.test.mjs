/* ทดสอบ: `list=orderfacets` **ไม่ส่งช่วงวัน ⇒ ต้องประกาศตัว** ห้ามคืนก้อนว่างเงียบ ๆ
 *
 * 🔴 ที่มาของเทสนี้ (15 ต.ค. 2569 · ใบ t_mv8xgvo0) — ความผิดของ CTO เอง:
 *    ยิงเส้นนี้โดยไม่ใส่ `from`/`to` ได้ `byChannel: []` แล้วสรุปว่า "ร้านไม่มีค่าช่องทางเลย"
 *    แล้ว **สั่งฝั่งจอห้ามทำปุ่มช่องทางการขาย** · ฝั่งจอยิงซ้ำแบบใส่ช่วงวันได้ 8 ช่อง ⇒ คำสั่งผิด
 *    📏 วัดจริง: ไม่ใส่ช่วงวัน ⇒ byChannel 0 · byStatus 0 · byPayStatus 0 · stores 0 (ว่างทั้งสี่)
 *
 * 🔑 เทสนี้จับ **การยุบสองสถานะเป็นหนึ่ง**: "ยังไม่ได้ถาม" ต้องไม่หน้าตาเหมือน "ถามแล้วไม่มี"
 * ⚠️ และต้องจับ **ทั้งสองทิศ** ไม่ใช่แค่ทิศเดียว:
 *    ① ไม่ส่งช่วงวัน ⇒ **ห้ามมีคีย์** byChannel/byStatus/byPayStatus/stores · ต้องมีธง `ต้องระบุช่วงวัน`
 *    ② ส่งช่วงวัน    ⇒ **ต้องไม่มีธงนั้น** (ไม่งั้นธงจะติดตลอดกาลแล้วจอเลิกอ่าน)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ซอร์ส = readFileSync("netlify/functions/core.mjs", "utf8");

test("orderfacets: ไม่ส่งช่วงวัน ⇒ ไม่ส่งคีย์ก้อนว่าง และต้องมีธงบอก", () => {
  const i = ซอร์ส.indexOf('if (p.get("list") === "orderfacets")');
  assert.ok(i > 0, "หาบล็อก orderfacets ไม่เจอ — เทสนี้ชี้ผิดที่แล้ว ห้ามปล่อยผ่าน");
  const บล็อก = ซอร์ส.slice(i, i + 3000);

  assert.match(บล็อก, /if \(!p\.get\("from"\) && !p\.get\("to"\)\)/,
    "ต้องมีด่าน 'ไม่ส่ง from และ to' ก่อนเรียก listOrderFacets");
  assert.match(บล็อก, /ต้องระบุช่วงวัน: true/,
    "ต้องมีฟิลด์ความหมายเดียวบอกว่าต้องมีช่วงวัน");

  /* ⚠️ ด่านสำคัญ: ทางที่ไม่มีช่วงวัน **ต้องไม่พูดถึงคีย์ก้อน** เลย
     (ถ้าใครเผลอใส่ byChannel: [] กลับมา เทสนี้ต้องแดง) */
  const ทางไม่มีช่วงวัน = บล็อก.slice(
    บล็อก.indexOf('if (!p.get("from") && !p.get("to"))'),
    บล็อก.indexOf("return okJson({\n        ...(await listOrderFacets")
  );
  for (const คีย์ of ["byChannel:", "byStatus:", "byPayStatus:", "stores:"]) {
    assert.ok(!ทางไม่มีช่วงวัน.includes(คีย์),
      `ทางที่ไม่มีช่วงวันต้องไม่ส่งคีย์ ${คีย์} เลย — ก้อนว่างแปลว่า "ถามแล้วไม่มี" ซึ่งไม่ใช่ความจริง`);
  }
});

test("orderfacets: ทางที่มีช่วงวันต้องไม่ติดธง ต้องระบุช่วงวัน", () => {
  const i = ซอร์ส.indexOf("return okJson({\n        ...(await listOrderFacets");
  assert.ok(i > 0, "หาทางปกติของ orderfacets ไม่เจอ");
  const ทางปกติ = ซอร์ส.slice(i, i + 1200);
  assert.ok(!ทางปกติ.includes("ต้องระบุช่วงวัน"),
    "ธงนี้ต้องไม่ติดในทางปกติ — ธงที่ขึ้นทุกรอบคือธงที่คนเลิกอ่าน");
});
