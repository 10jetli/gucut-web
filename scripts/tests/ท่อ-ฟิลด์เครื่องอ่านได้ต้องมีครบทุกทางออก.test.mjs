// รัน: node --experimental-test-module-mocks --test scripts/tests/ท่อ-ฟิลด์เครื่องอ่านได้ต้องมีครบทุกทางออก.test.mjs
// ใบ t_mu1bkrdw (ต่อจากสัญญา 503) — ฝั่งจอวัดจับได้หลัง deploy `693e981` ว่า
// `upstream`/`zortCode`/`zortDesc` มาครบทุกทาง **แต่ `upstreamOk` มาเฉพาะตอนสำเร็จ
// และ `retryable` มาเฉพาะตอนล้ม** ⇒ กฎ "ไม่มีช่อง ≠ ไม่มีปัญหา" ที่ผมเขียนเองใช้ไม่ครบ
//
// 🔑 **ด่านนี้ยิงของจริงทุกทางออก ไม่ใช่อ่านซอร์ส**
//    ฝั่งจอขอไว้ตรง ๆ: *"ด่านที่ตรวจเฉพาะ 'ค่าถูกตอนมี' มองไม่เห็นช่องที่หายไป
//    ซึ่งเป็นรูที่ใบนี้เจอ"* ⇒ เกณฑ์คือ **`k in r` ทุกช่อง ทุกทางออก**
//    ⚠️ และห้ามเขียนด่านเป็น "ซอร์สต้องเรียก ตอบ()" — ด่านอ่านข้อความเขียวได้ตอนพฤติกรรมตาย
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zortReadList } from '../../netlify/lib/zort-finance.mjs';

const ช่องที่เครื่องต้องอ่านได้ = ["upstream", "upstreamOk", "retryable", "zortCode", "zortDesc"];

function ครบทุกช่อง(r, ชื่อทาง) {
  for (const k of ช่องที่เครื่องต้องอ่านได้) {
    assert.ok(k in r,
      `🔴 ทางออก "${ชื่อทาง}" ไม่มีช่อง \`${k}\` — จอจะอ่านเป็น undefined = "ท่อรุ่นเก่า" ทั้งที่ท่อใหม่`);
  }
}

/** ยืมรหัสปลอมแล้วคืนให้เหมือนเดิม — ไม่งั้นทางออก skip ของเทสข้ออื่นจะเพี้ยน */
async function ด้วยรหัสปลอม(fetchปลอม, งาน) {
  const เดิม = { ...process.env };
  const fetchเดิม = globalThis.fetch;
  process.env.ZORT_STORENAME = "ร้านทดสอบ";
  process.env.ZORT_APIKEY = "คีย์ทดสอบ";
  process.env.ZORT_APISECRET = "ลับทดสอบ";
  globalThis.fetch = fetchปลอม;
  try { return await งาน(); }
  finally {
    globalThis.fetch = fetchเดิม;
    for (const k of ["ZORT_STORENAME", "ZORT_APIKEY", "ZORT_APISECRET"]) {
      if (k in เดิม) process.env[k] = เดิม[k]; else delete process.env[k];
    }
  }
}

test('ทางออก 400 (ขอผิดตั้งแต่ขาเข้า) ต้องมีช่องครบ 5 — และ upstreamOk ต้องเป็น null ไม่ใช่ false', async () => {
  const ทาง = [
    ["ชนิดไม่รู้จัก", { kind: "xxx" }],
    ["วันที่ผิดรูป", { kind: "incomes", from: "13/9/2569" }],
    ["ชนิดที่กรองวันที่ไม่ได้", { kind: "variations", from: "2026-10-01" }],
    ["from หลัง to", { kind: "incomes", from: "2026-10-02", to: "2026-10-01" }],
    ["type กับชนิดที่ไม่มีตัวกรอง", { kind: "incomes", type: "a" }],
    ["type ค่าไม่รู้จัก", { kind: "transfers", type: "zzz" }],
  ];
  for (const [ชื่อ, input] of ทาง) {
    const r = await zortReadList(input);
    assert.equal(r.ok, false, `${ชื่อ} ต้องไม่ผ่าน`);
    ครบทุกช่อง(r, ชื่อ);
    /* 🔑 **ยังไม่ได้ถาม ZORT ⇒ ตอบแทนเขาไม่ได้** — `false` จะแปลว่า "ถามแล้วพัง"
       ซึ่งจะทำให้จอขึ้นกล่อง "ZORT ล่ม" ตอนที่ความจริงคือเราขอผิดเอง */
    assert.equal(r.upstreamOk, null, `${ชื่อ}: upstreamOk ต้องเป็น null (ยังไม่ได้ถาม) ไม่ใช่ ${r.upstreamOk}`);
    assert.equal(r.retryable, false, `${ชื่อ}: ขอผิดแบบเดิมซ้ำก็ผิดเหมือนเดิม ⇒ retryable ต้องเป็น false`);
  }
});

test('ทางออก skip (ยังไม่ได้ตั้งรหัส) ต้องมีช่องครบ 5', async () => {
  const เดิม = { ...process.env };
  for (const k of ["ZORT_STORENAME", "ZORT_APIKEY", "ZORT_APISECRET"]) delete process.env[k];
  try {
    const r = await zortReadList({ kind: "incomes" });
    assert.ok(r.skip, 'ไม่มีรหัส ⇒ ต้องได้ skip');
    ครบทุกช่อง(r, "skip");
    assert.equal(r.upstreamOk, null, 'ไม่เคยยิงออกไป ⇒ null');
  } finally {
    for (const k of ["ZORT_STORENAME", "ZORT_APIKEY", "ZORT_APISECRET"]) {
      if (k in เดิม) process.env[k] = เดิม[k];
    }
  }
});

test('ทางออก unknown · ยิงไม่ถึง ZORT ⇒ ครบ 5 ช่อง + upstreamOk=false + retryable=true', async () => {
  const r = await ด้วยรหัสปลอม(
    async () => { throw new Error("ETIMEDOUT ทดสอบ"); },
    () => zortReadList({ kind: "incomes" }),
  );
  assert.equal(r.unknown, true);
  ครบทุกช่อง(r, "ยิงไม่ถึง");
  assert.equal(r.upstreamOk, false, 'ถามแล้วไม่ถึง ⇒ ปลายทางใช้ไม่ได้');
  assert.equal(r.retryable, true, 'เน็ตสะดุดลองใหม่ได้');
});

test('ทางออก unknown · ZORT ตอบ 200 แต่ไม่คืนรายการ ⇒ ครบ 5 ช่อง + พา resDesc ของ ZORT ออกมา', async () => {
  const r = await ด้วยรหัสปลอม(
    async () => new Response(JSON.stringify({ res: { resCode: "500", resDesc: "Object reference not set to an instance of an object." } }),
      { status: 200, headers: { "content-type": "application/json" } }),
    () => zortReadList({ kind: "moneytransfers" }),
  );
  assert.equal(r.unknown, true);
  ครบทุกช่อง(r, "200 แต่ไม่มี list");
  assert.equal(r.upstreamOk, false);
  assert.equal(r.retryable, true);
  assert.equal(r.zortCode, "500", 'รหัสของ ZORT ต้องถึงจอ');
  assert.match(r.zortDesc, /Object reference/, 'ข้อความของ ZORT ต้องถึงจอ — นี่คือสิ่งที่ 502 กินไปทั้งก้อน');
});

test('ทางออกสำเร็จ ⇒ ครบ 5 ช่อง + upstreamOk=true + retryable=false (เดิมไม่มีช่อง retryable)', async () => {
  const r = await ด้วยรหัสปลอม(
    async () => new Response(JSON.stringify({ list: [{ id: 1 }], count: 1 }),
      { status: 200, headers: { "content-type": "application/json" } }),
    () => zortReadList({ kind: "incomes" }),
  );
  assert.equal(r.ok, true);
  ครบทุกช่อง(r, "สำเร็จ");
  assert.equal(r.upstreamOk, true);
  assert.equal(r.retryable, false, '🔑 สำเร็จแล้วไม่ต้องลองซ้ำ — ช่องนี้เดิม "ไม่มี" จอจึงแยกจากท่อรุ่นเก่าไม่ออก');
});

test('🔬 พลังแยกแยะ: ถ้าทางออกใดคืนก้อนดิบ (ลืมห่อ ตอบ()) ด่านต้องแดง', () => {
  const ลืมห่อ = { ok: false, unknown: true, upstream: "zort", retryable: true };
  assert.throws(() => ครบทุกช่อง(ลืมห่อ, "ปลูก"), /ไม่มีช่อง `upstreamOk`/,
    'ตัวตรวจต้องจับช่องที่หายได้จริง ไม่ใช่ผ่านเพราะมีบางช่อง');
  /* ⚠️ ปลูกแบบนี้สำคัญ: ก้อนที่ "มี upstream + retryable" คือ **หน้าตาของบั๊กตัวจริง**
     ที่ฝั่งจอเจอ ⇒ ด่านที่ปลูกด้วยก้อนว่างเปล่าจะเขียวทั้งที่จับของจริงไม่ได้ */
});
