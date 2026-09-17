// รัน: node --experimental-test-module-mocks --test scripts/tests/stock-push-sweep.test.mjs
// 🔴 17 ก.ย. 2569: ยิงจริงผ่าน 76/76 (15:16) แต่สมุด push_state ไม่มีแถวไหนได้ pushed_at
//    ⇒ รอบกวาดถัดไปยืนยันไม่ได้สักรหัส (`เคยยืนยัน` = 0) ทั้งที่รหัสหายจากแผนแล้ว
//    ต้นตอ: ตัวยิงคืนผลในคีย์ `results` แต่ตัวกวาดอ่าน `rows`
//    ⇒ ชุดนี้ป้อน **คำตอบรูปจริงของ stockPushLive** แล้วดูว่า pushed_qty/pushed_at ลงคำสั่ง INSERT จริงไหม
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const คำสั่ง = [];
const ส่งแผนมา = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => { คำสั่ง.push({ sql, params }); return []; },
} });
mock.module('../../netlify/lib/stock-push.mjs', { namedExports: {
  stockPushDryRun: async ({ platform = 'lazada' } = {}) => ({ [platform]: {
    push: [{ sku: 'A1', from: 1, to: 5, kind: 'up' }, { sku: 'B2', from: 2, to: 9, kind: 'up' }],
    skipNegativeFull: [], skipUnknownFull: [], skipConflictFull: [],
  } }),
} });
/* รูปคำตอบจริงของ stockPushLive (อ่านจากโค้ด 17 ก.ย. 2569): ผลรายตัวอยู่ใน `results` · ไม่มี `rows` */
mock.module('../../netlify/lib/stock-push-live.mjs', { namedExports: {
  stockPushLive: async ({ skus }, opts) => (ส่งแผนมา.push(opts), {
    fired: skus.length, pushed: 1, rejected: 1, notSent: 0,
    results: [
      { sku: 'A1', from: 1, to: 5, kind: 'up', result: 'pushed' },
      { sku: 'B2', from: 2, to: 9, kind: 'up', result: 'rejected', why: '4171: exceeds 50' },
    ],
  }),
} });

const ยิงShopee = [];
mock.module('../../netlify/lib/stock-push-shopee.mjs', { namedExports: {
  shopeePushLive: async ({ skus }) => (ยิงShopee.push(skus), { fired: skus.length, pushed: skus.length, rejected: 0, notSent: 0,
    results: skus.map((sku) => ({ sku, to: 5, result: 'pushed' })) }),
} });
mock.module('../../netlify/lib/stock-push-tiktok.mjs', { namedExports: { tiktokPushLive: async () => ({ results: [] }) } });

const { กวาดดันสต็อก, สถานะดันสต็อก, ยิงจริงของ } = await import('../../netlify/lib/stock-push-sweep.mjs');

test('ยิงจริงแล้ว ⇒ แถวที่ยิงต้องลงสมุดพร้อม pushed_qty และแถวที่ถูกปฏิเสธต้องมี last_error', async () => {
  คำสั่ง.length = 0;
  const r = await กวาดดันสต็อก({ platform: 'lazada', force: true });
  assert.equal(r.ok, true);
  const แทรก = คำสั่ง.filter((c) => /INSERT INTO push_state/.test(c.sql));
  assert.ok(แทรก.length > 0, 'ต้องมีคำสั่งเขียนสมุด');
  const ค่าทั้งหมด = แทรก.flatMap((c) => c.params);
  /* 15 คอลัมน์ต่อแถว: sku,channel,planned_qty,planned_at,pushed_qty,pushed_at,push_result,... last_error(13) */
  const แถวของ = (sku) => { const i = ค่าทั้งหมด.indexOf(sku); return ค่าทั้งหมด.slice(i, i + 15); };
  const a = แถวของ('A1'); const b = แถวของ('B2');
  assert.equal(a[4], 5, 'A1 ต้องได้ pushed_qty = 5 (ยิงผ่าน)');
  assert.ok(a[5], 'A1 ต้องได้ pushed_at — ไม่มีค่านี้ รอบถัดไปยืนยันไม่ได้');
  assert.equal(a[6], 'pushed');
  assert.equal(b[6], 'rejected');
  assert.match(String(b[13]), /4171/, 'B2 ต้องมี last_error พร้อมเหตุผลจากแพลตฟอร์ม');
});

test('ตัวกวาดส่งแผนที่เพิ่งคิดให้ตัวยิงใช้ซ้ำ + บอกเวลารายขั้น', async () => {
  ส่งแผนมา.length = 0;
  const r = await กวาดดันสต็อก({ platform: 'lazada', force: true });
  assert.equal(ส่งแผนมา.length, 1);
  const o = ส่งแผนมา[0]?.แผนที่คิดแล้ว;
  assert.ok(o?.plan?.lazada?.push?.length === 2, 'ต้องส่งแผนเต็มชุดเดียวกับที่ตัวกวาดใช้');
  assert.ok(Date.now() - o.คิดเมื่อ < 5000, 'เวลาคิดแผนต้องเป็นของจริงรอบนี้');
  for (const k of ['แผน_ms', 'ยิง_ms', 'เขียนสมุด_ms']) assert.equal(typeof r.steps?.[k], 'number', k);
});

test('สวิตช์แยกต่อเจ้า: STOCK_PUSH_AUTO=1 เปิดแค่ Lazada · Shopee ต้องมีสวิตช์ของตัวเอง', async () => {
  const เดิม = { a: process.env.STOCK_PUSH_AUTO, s: process.env.STOCK_PUSH_AUTO_SHOPEE };
  process.env.STOCK_PUSH_AUTO = '1'; delete process.env.STOCK_PUSH_AUTO_SHOPEE;
  assert.equal(ยิงจริงของ('lazada'), true);
  assert.equal(ยิงจริงของ('shopee'), false);
  ยิงShopee.length = 0; ส่งแผนมา.length = 0;
  const r = await กวาดดันสต็อก({ platform: 'shopee' });
  assert.equal(r.ok, true);
  assert.equal(ยิงShopee.length, 0, 'ต้องไม่ยิง Shopee เพราะสวิตช์ของ Shopee ยังปิด');
  assert.match(r.mode, /ซ้อม/);
  process.env.STOCK_PUSH_AUTO_SHOPEE = '1';
  const r2 = await กวาดดันสต็อก({ platform: 'shopee' });
  assert.equal(ยิงShopee.length, 1, 'สวิตช์ Shopee เปิด ⇒ ยิงผ่านตัวยิงของ Shopee');
  assert.equal(ส่งแผนมา.length, 0, 'ต้องไม่เรียกตัวยิง Lazada');
  assert.equal(r2.pushed, 2);
  if (เดิม.a === undefined) delete process.env.STOCK_PUSH_AUTO; else process.env.STOCK_PUSH_AUTO = เดิม.a;
  if (เดิม.s === undefined) delete process.env.STOCK_PUSH_AUTO_SHOPEE; else process.env.STOCK_PUSH_AUTO_SHOPEE = เดิม.s;
});

test('สถานะ: channelsWithoutWriter คิดจากทะเบียนตัวยิง · มี byChannel ครบสามเจ้า', async () => {
  const r = await สถานะดันสต็อก();
  assert.deepEqual(r.channelsWithoutWriter, []);
  assert.deepEqual(Object.keys(r.byChannel).sort(), ['lazada', 'shopee', 'tiktok']);
  assert.equal(r.byChannel.shopee.มีตัวยิง, true);
  assert.equal(typeof r.byChannel.tiktok.autoOn, 'boolean');
});

test('ยิงซ้ำในตัวกวาดต้องล้างการยืนยันเก่า — ไม่งั้นรอบยิงใหม่ที่พังดูเหมือนยืนยันแล้ว', async () => {
  คำสั่ง.length = 0;
  await กวาดดันสต็อก({ platform: 'lazada', force: true });
  const แทรก = คำสั่ง.find((c) => /INSERT INTO push_state/.test(c.sql) && /ON CONFLICT\(sku,channel\)/.test(c.sql));
  assert.match(แทรก.sql, /verified_at\s*= CASE WHEN excluded\.pushed_at IS NOT NULL THEN NULL/);
  assert.match(แทรก.sql, /verified_qty\s*= CASE WHEN excluded\.pushed_at IS NOT NULL THEN NULL/);
});
