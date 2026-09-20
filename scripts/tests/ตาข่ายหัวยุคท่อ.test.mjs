/* 🕰️ ด่าน: **ตาข่ายเติมหัวยุคท่อ ต้องทำงานจริง และต้องไม่ทำให้คำตอบเพี้ยน**
 *
 * 🔴 ที่มา 21 ก.ย. 2569 — ฝั่งจอชี้ว่าท่า "ไล่ใส่หัวทีละ `return`" (ท่าที่ผมใช้รอบแรก)
 *    จะพังวันที่มีคนเพิ่มทางออกใหม่แล้วลืม ⇒ **หัวหายเฉพาะบางเส้น ⇒ อ่านว่า "รุ่นเก่า"**
 *    = แดงลวงทิศเดียวกับปัญหาที่หัวนี้มีไว้แก้ ⇒ ผมรับท่า **ห่อที่เดียว** มาใช้
 * 🔑 ด่านนี้ทดสอบ **พฤติกรรมของตัวห่อ** (ไม่ใช่การอ่านซอร์ส) เพราะสิ่งที่กลัวคือ
 *    "ห่อแล้ว body หาย" หรือ "204 มี body แล้วรันไทม์โยน" — สองอย่างนี้อ่านซอร์สไม่เห็น
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ติดหัวยุคถ้าขาด } from "../../netlify/lib/core-headers.mjs";

const BUILD = "2026-09-21T00:11:22.333Z";

test("คำตอบที่ยังไม่มีหัว ⇒ ได้หัว และ **body/สถานะเดิมครบ**", async () => {
  const เดิม = new Response(JSON.stringify({ ok: true, ping: true }), {
    status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
  const ใหม่ = ติดหัวยุคถ้าขาด(เดิม, BUILD);
  assert.equal(ใหม่.headers.get("x-core-build"), BUILD);
  assert.equal(ใหม่.headers.get("cache-control"), "no-store", "หัวเดิมต้องไม่หาย");
  assert.equal(ใหม่.status, 200);
  assert.deepEqual(await ใหม่.json(), { ok: true, ping: true }, "🔴 body ต้องไม่หายตอนห่อใหม่");
});

test("มีหัวอยู่แล้ว ⇒ คืน **ตัวเดิม** (ไม่จ่ายค่าห่อฟรี ๆ ทุกคำขอ)", () => {
  const เดิม = new Response("{}", { headers: { "x-core-build": "2026-09-01T00:00:00.000Z" } });
  const ใหม่ = ติดหัวยุคถ้าขาด(เดิม, BUILD);
  assert.equal(ใหม่, เดิม, "ต้องเป็นวัตถุเดียวกัน");
  assert.equal(ใหม่.headers.get("x-core-build"), "2026-09-01T00:00:00.000Z", "ห้ามเขียนทับค่าที่กิ่งตั้งมาเอง");
});

test("🚫 204/304 ต้องห่อได้โดยไม่โยน error (ห้ามส่ง body ไปกับสถานะที่ห้ามมี body)", async () => {
  for (const st of [204, 304]) {
    const ใหม่ = ติดหัวยุคถ้าขาด(new Response(null, { status: st }), BUILD);
    assert.equal(ใหม่.status, st);
    assert.equal(ใหม่.headers.get("x-core-build"), BUILD);
    assert.equal(await ใหม่.text(), "", `${st} ต้องไม่มีเนื้อ`);
  }
});

test("🚫 build ว่าง ⇒ **ไม่ใส่หัว** (ส่งค่าว่างแย่กว่าไม่ส่ง — จอจะอ่านว่ามีหัวแต่ไม่มีค่า)", () => {
  const เดิม = new Response("{}");
  for (const v of ["", null, undefined]) {
    const ใหม่ = ติดหัวยุคถ้าขาด(เดิม, v);
    assert.equal(ใหม่.headers.get("x-core-build"), null, `build=${JSON.stringify(v)} ต้องไม่ใส่หัว`);
  }
});

test("ของที่ไม่ใช่ Response ⇒ คืนกลับเฉย ๆ ห้ามโยน (ตาข่ายห้ามทำให้ท่อล้ม)", () => {
  for (const v of [null, undefined, 42, {}, "ข้อความ"]) {
    assert.doesNotThrow(() => ติดหัวยุคถ้าขาด(v, BUILD));
  }
});

test("🔴 build ที่มีอักขระนอก Latin-1 ⇒ **คืนของเดิม ห้ามโยน**", async () => {
  /* ค่าหัว HTTP เป็น ByteString ⇒ ภาษาไทยทำให้ `Headers.set` โยนทันที
     (ผมเจอเพราะเขียนเทสนี้ผิดเอง — และมันคือทางที่ตาข่ายจะล้มทั้งท่อได้จริง) */
  const เดิม = new Response(JSON.stringify({ ok: true }));
  let ใหม่;
  assert.doesNotThrow(() => { ใหม่ = ติดหัวยุคถ้าขาด(เดิม, "ยุคไทย"); });
  assert.equal(ใหม่, เดิม, "ใส่ไม่ได้ ⇒ ต้องคืนของเดิม ไม่ใช่คำตอบที่พัง");
  assert.deepEqual(await ใหม่.json(), { ok: true }, "body ต้องยังอ่านได้");
});

test("🔬 พลังแยกแยะ: ถ้าตัวห่อคืนของเดิมตลอด ⇒ ข้อแรกต้องแดง", () => {
  const ท่าผิด = (res) => res;
  const เดิม = new Response("{}");
  assert.equal(ท่าผิด(เดิม).headers.get("x-core-build"), null, "ท่าผิดไม่ใส่หัว");
  assert.equal(ติดหัวยุคถ้าขาด(เดิม, BUILD).headers.get("x-core-build"), BUILD, "ของจริงต้องใส่");
});
