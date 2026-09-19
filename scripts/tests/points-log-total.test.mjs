/* เทส `/api/points` — **`logTotal` ต้องบอกจำนวนจริงเมื่อ `log` ถูกตัด**
 *
 * 🔴 ที่มา 19–20 ก.ย. 2569 · ฝั่งจอเจอคลาสนี้ในของเขา (`heldBack` ตัดที่ 10 ไม่มีจำนวนเต็ม)
 *    แล้วฝากให้ผมกวาดฝั่งท่อ ⇒ เจอ `/api/points` ส่ง `log` ตัดที่ 30 **ขึ้นจอลูกค้า**
 *    ⇒ ลูกค้าเห็น 30 บรรทัดแล้วอ่านว่า "นี่คือประวัติแต้มทั้งหมดของฉัน"
 *
 * 🔑 **และเทสไฟล์นี้มีไว้เพื่อ "เดินทางที่ยังไม่เคยถูกเดิน" ไม่ใช่เพื่อยืนยันตรรกะ**
 *    ฝั่งจอชี้ข้อนี้ตรง ๆ: ผมทดสอบตรรกะแยก 4 ค่าแล้วจริง **แต่ทาง `pointLog.length > 30`
 *    ยังไม่เคยถูกเดินในของจริงเลย** ⇒ *"ทดสอบตรรกะได้" ≠ "เดินทางจริงแล้ว" ต้องรายงานคนละคำ*
 *    ⇒ ไฟล์นี้ทำให้ทางนั้น **ถูกเดินจริงในเครื่อง** (mock ผู้ใช้ที่มีประวัติ 47 รายการ)
 *      ⇒ ไม่ต้องรอลูกค้าจริงที่มีแต้มเกิน 30 — แบบเดียวกับที่ฝั่งจอปลูกปัญหาปลอม 23 จุด
 *        ให้บรรทัดที่ไม่เคยถูกพิมพ์ได้พิมพ์จริง
 *    ⚠️ ที่ยังต้องทำหลัง deploy: ยิงเส้นจริงหนึ่งครั้ง (ตัวปลอมเห็นได้แค่มิติที่เราใส่ให้)
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const ผู้ใช้ที่มีประวัติ = (n) => ({
  user: { points: 1234, pointLog: Array.from({ length: n }, (_, i) => ({ n: i, at: "2026-09-20" })) },
});

async function ยิงGET(จำนวนประวัติ) {
  mock.reset();
  mock.module("../../netlify/lib/session.mjs", {
    namedExports: {
      currentUser: async () => ผู้ใช้ที่มีประวัติ(จำนวนประวัติ),
      normPhone: (p) => String(p ?? ""),
      store: () => ({}),
    },
  });
  mock.module("../../netlify/lib/points.mjs", {
    namedExports: {
      readLoyalty: async () => ({ on: true, earnPer: 100 }),
      writeLoyalty: async () => {},
      addPoints: async () => {},
      addPending: async () => {},
    },
  });
  mock.module("../../netlify/lib/admin-gate.mjs", {
    namedExports: { adminGate: async () => ({ wants: false, ok: false, deny: null }), หัวของด่าน: () => ({}) },
  });
  const { default: handler } = await import(`../../netlify/functions/points.mjs?t=${Date.now()}`);
  const res = await handler({ method: "GET", headers: { get: () => null } }, {});
  return res.json();
}

test("🔑 ประวัติ 47 รายการ ⇒ log ตัดที่ 30 แต่ logTotal บอก 47 (ทางที่ยังไม่เคยถูกเดิน)", async () => {
  const d = await ยิงGET(47);
  assert.equal(d.log.length, 30, "log ต้องถูกตัดที่ 30 ตามเดิม");
  assert.equal(d.logTotal, 47, "logTotal ต้องบอกจำนวนจริง — ไม่งั้นลูกค้าอ่านว่า 30 คือทั้งหมด");
  assert.equal(d.points, 1234);
});

test("ตัวควบคุมลบ: ประวัติ 5 รายการ ⇒ logTotal เท่ากับที่ส่งไป (ไม่โกหกทางกลับ)", async () => {
  const d = await ยิงGET(5);
  assert.equal(d.log.length, 5);
  assert.equal(d.logTotal, 5, "ไม่ถูกตัด ⇒ สองค่าต้องเท่ากัน");
});

test("ตัวควบคุมลบ: ไม่มีประวัติเลย ⇒ log ว่าง · logTotal 0 (ไม่ใช่ null/undefined)", async () => {
  mock.reset();
  mock.module("../../netlify/lib/session.mjs", {
    namedExports: { currentUser: async () => ({ user: { points: 0 } }), normPhone: (p) => String(p ?? ""), store: () => ({}) },
  });
  mock.module("../../netlify/lib/points.mjs", {
    namedExports: { readLoyalty: async () => ({ on: true }), writeLoyalty: async () => {}, addPoints: async () => {}, addPending: async () => {} },
  });
  mock.module("../../netlify/lib/admin-gate.mjs", {
    namedExports: { adminGate: async () => ({ wants: false, ok: false, deny: null }), หัวของด่าน: () => ({}) },
  });
  const { default: handler } = await import(`../../netlify/functions/points.mjs?t=${Date.now()}`);
  const d = await (await handler({ method: "GET", headers: { get: () => null } }, {})).json();
  assert.deepEqual(d.log, []);
  assert.equal(d.logTotal, 0, "0 ไม่ใช่ null — 'ไม่มีประวัติ' ต่างจาก 'ไม่รู้จำนวน'");
});
