/* ด่าน: ผลของ zortClaimCheck ต้องบอก **จำนวนที่ยิงจริง** และ 0 ต้องไม่ขึ้นเขียว
 * 🔴 ที่มา 19 ก.ย. 2569 — ยิงของจริงได้ ok:true + สามกองว่าง **โดยไม่มีเลขบอกว่ายิงอะไรไป**
 *    ⇒ ผลหน้าตาเดียวกันเป๊ะระหว่าง "ยิงครบแล้วทุกอย่างยังจริง" กับ "ไม่ได้ยิงอะไรเลย"
 *    🔑 ตัววัดที่ไม่บอกขนาดงานที่มันทำ ให้เขียวที่แปลไม่ได้
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { zortClaimCheck } from "../../netlify/lib/zort-claim-check.mjs";
import { ZORT_NO_API } from "../../netlify/lib/zort-write.mjs";

/* โลกที่ "ตรงกับที่เราเขียนไว้ทุกข้อ": ชื่อในทะเบียน "ZORT ไม่เปิด API" ⇒ missing
   ชื่ออื่น (รวมทะเบียน "มีเส้นแต่เรายังไม่ทำ" และตัวควบคุม) ⇒ exists
   🔑 ต้องสร้างโลกให้ตรงกับคำกล่าวอ้างก่อน ไม่งั้น ok:false คือผลที่ถูก และด่านจะจับผิดข้อ
      (รอบแรกผมให้ทุกชื่อ missing ⇒ gone 18 รายการ ⇒ ด่านแดงเพราะเทสผิด ไม่ใช่โค้ดผิด) */
const ชื่อที่อ้างว่าไม่มี = new Set(
  ZORT_NO_API.flatMap((r) => [...String(r.probe ?? "").matchAll(/\b([A-Z][A-Za-z]+\/[A-Za-z_]+)/g)].map((m) => m[1]))
);
const ตัวควบคุมผ่าน = (path) => (ชื่อที่อ้างว่าไม่มี.has(path) ? "missing" : "exists");

test("ยิงสำเร็จ ⇒ ต้องมี probed > 0 และผลรวมสามสถานะเท่ากับ probed", async () => {
  const r = await zortClaimCheck({ probe: async (p) => ตัวควบคุมผ่าน(p) });
  assert.equal(r.ok, true);
  assert.ok(r.probed > 0, "ต้องบอกจำนวนที่ยิงจริง ไม่ใช่เขียวเปล่า ๆ");
  const b = r.probedBreakdown;
  assert.equal(b.exists + b.missing + b.unknown, r.probed, "สามสถานะต้องบวกได้เท่าที่ยิง");
  assert.equal(r.inconclusive, undefined, "ยิงได้จริง ⇒ ห้ามติดธงแปลผลไม่ได้");
});

test("ยิงไม่ถึง ⇒ ต้องเข้ากอง unknown ไม่ใช่กลืนเงียบ", async () => {
  const r = await zortClaimCheck({ probe: async (p) => (/GetProducts|GetOrders/.test(p) ? "exists" : "unknown") });
  assert.ok(r.unknown.length > 0, "ยิงไม่ถึงต้องรายงาน");
  assert.equal(r.probedBreakdown.missing, 0);
});

test("ตัวควบคุมไม่ผ่าน ⇒ inconclusive และ **ห้ามมีคีย์ ok**", async () => {
  const r = await zortClaimCheck({ probe: async () => "unknown" });
  assert.equal(r.inconclusive, true);
  assert.equal("ok" in r, false, "'ผลแปลไม่ได้' ต้องไม่มีคีย์ ok เลย (ไม่ใช่ ok:false)");
});
