import { mock, test } from "node:test";
import assert from "node:assert/strict";

/* 🔴 ZORT ตอบ 5xx เป็น HTML ⇒ parse JSON ไม่ได้
   ของเดิมคืน ok:false **โดยไม่ติด unknown** ⇒ จออ่านว่า "ไม่สำเร็จ" แล้วชวนกดซ้ำ
   แต่ ZORT อาจบันทึกใบไปแล้ว ⇒ กดซ้ำ = ใบขายเข้าสองรอบ สต็อกตัดสองรอบ
   เทสนี้ยิงผ่านฟังก์ชันจริงโดยปลอม fetch (ไม่แตะ ZORT) */
/* ตัวกันซ้ำของท่ออ่าน Netlify Blobs — ในเทสไม่มีที่เก็บ ⇒ ของจริงจะคืน
   "ตรวจใบซ้ำไม่ได้ ยังไม่ส่งเข้า ZORT" **ก่อน**ถึงจุดที่เราอยากทดสอบ (ซึ่งถูกตามดีไซน์)
   ⇒ ต้องปลอมที่เก็บ ไม่ใช่ปลอมตรรกะกันซ้ำ เพื่อให้เทสเดินผ่านเส้นทางจริง [[test-must-hit-the-path]] */
mock.module("@netlify/blobs", { namedExports: {
  getStore: () => ({ get: async () => null, setJSON: async () => {}, set: async () => {} }),
} });

const withFetch = async (impl, fn) => {
  const saved = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = saved; }
};
process.env.ZORT_STORENAME = "s"; process.env.ZORT_APIKEY = "k"; process.env.ZORT_APISECRET = "x";
const { zortAddProduct } = await import("../../netlify/lib/zort-write.mjs");

const call = (status, body) =>
  withFetch(
    async () => ({ ok: status < 400, status, json: async () => { if (body === null) throw new Error("not json"); return body; } }),
    () => zortAddProduct({ ref: "t1", sku: "A1", name: "ทดสอบ", confirm: true })
  );

test("ZORT ตอบ 500 เป็น HTML ⇒ unknown:true + zortDown:true (ห้ามบอกว่าไม่สำเร็จ)", async () => {
  const r = await call(500, null);
  assert.equal(r.ok, false);
  assert.equal(r.unknown, true, "ต้องติดธงไม่รู้ผล ไม่งั้นจอชวนกดซ้ำ");
  assert.equal(r.zortDown, true);
  assert.equal(r.zortHttp, 500);
  assert.match(r.error, /ยังไม่รู้ว่าบันทึกหรือไม่/);
});

test("ตอบ 400 ที่ไม่ใช่ JSON ⇒ ยังไม่รู้ผล แต่ไม่ใช่ zortDown", async () => {
  const r = await call(400, null);
  assert.equal(r.unknown, true);
  assert.equal(r.zortDown, false);
  assert.equal(r.zortHttp, 400);
});

test("ตอบ JSON แต่ไม่มีรหัสผล ⇒ unknown + มี zortHttp ให้จอเช็ค", async () => {
  const r = await call(200, { something: 1 });
  assert.equal(r.unknown, true);
  assert.equal(r.zortHttp, 200);
  assert.equal(r.zortDown, false);
});

/* ตัวควบคุม: สำเร็จจริงต้องไม่ติดธงพวกนี้ (ไม่งั้นจอจะขึ้นเตือนตอนของปกติ) */
test("สำเร็จจริง ⇒ ไม่มี zortDown/unknown", async () => {
  const r = await call(200, { res: { resCode: "200" }, id: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.unknown, undefined);
  assert.equal(r.zortDown, undefined);
});
