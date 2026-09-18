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
/* ⚠️ node:test ยอมให้ mock โมดูลเดิม **ครั้งเดียว** (ครั้งที่สองได้ ERR_INVALID_STATE)
   ⇒ เทสต์ที่ต้องการคำตอบคนละแบบ ให้สลับผ่าน `ผลยิงที่จะคืน` ไม่ใช่ mock ซ้ำ
   null = ใช้คำตอบมาตรฐาน (ยิงผ่าน 1 · ถูกปฏิเสธ 1) */
let ผลยิงที่จะคืน = null;
mock.module('../../netlify/lib/stock-push-live.mjs', { namedExports: {
  stockPushLive: async ({ skus }, opts) => (ส่งแผนมา.push(opts), ผลยิงที่จะคืน ?? {
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

/* ── notSentKind: กองของเสียต้องมีแต่ของเสียจริง ────────────────────────────────
   🔴 ฝั่งจอจับได้ 18 ก.ย. 2569: `?pushstuck=1&reason=error` ได้ 85 แถว
      แต่ **ทุกแถว** เป็นทิศลงที่เราเลือกไม่ส่งเอง ⇒ ไม่ใช่ error สักแถว
      ⇒ กองที่มีไว้ชี้ของเสีย กลบของเสียจริงไว้ใต้เสียงรบกวน [[noise-filters-eat-real-cases]]
   ⚠️ เคส "ไม่มี notSentKind" ต้องถือเป็น error — ตัวยิงรุ่นเก่าต้องพังไปทาง "มีคนมาดู" */
test('not_sent: policy_down/stale_plan ห้ามลง last_error · platform_error/unknown_id ต้องลง', async () => {
  const เคส = [
    { kind: 'policy_down',    why: 'ทิศลง (down 9→2) ต้องสั่งแยกด้วย allowClose:true', เป็นError: false },
    { kind: 'stale_plan',     why: 'ไม่อยู่ในแผนสดแล้ว',                                เป็นError: false },
    { kind: 'platform_error', why: 'timeout ยิงไม่ถึง Lazada',                          เป็นError: true  },
    { kind: 'unknown_id',     why: 'หา SkuId บน Lazada ไม่เจอ',                          เป็นError: true  },
    { kind: undefined,        why: 'ตัวยิงรุ่นเก่าไม่บอกเหตุ',                           เป็นError: true  },
  ];
  try {
    for (const c of เคส) {
      ผลยิงที่จะคืน = {
        fired: 1, pushed: 0, rejected: 0, notSent: 1,
        results: [{ sku: 'A1', from: 9, to: 2, kind: 'down', result: 'not_sent', notSentKind: c.kind, why: c.why }],
      };
      คำสั่ง.length = 0;
      await กวาดดันสต็อก({ platform: 'lazada', force: true });
      const ค่า = คำสั่ง.filter((x) => /INSERT INTO push_state/.test(x.sql)).flatMap((x) => x.params);
      const i = ค่า.indexOf('A1');
      assert.ok(i >= 0, `${c.kind}: ต้องมีแถว A1 ในคำสั่งเขียนสมุด`);
      const err = ค่า.slice(i, i + 15)[13];
      if (c.เป็นError) assert.ok(err, `${c.kind}: ต้องลง last_error เพราะต้องมีคนมาดู`);
      else assert.equal(err, null, `${c.kind}: ห้ามลง last_error — เราเลือกไม่ส่งเอง ไม่ใช่ความผิดพลาด`);
    }
  } finally {
    ผลยิงที่จะคืน = null;   // ⚠️ ต้องคืนค่าใน finally ไม่งั้นเทสต์ถัดไปแดงด้วยเหตุปลอม
  }
});

/* ── ตัวกวาดคำเท็จเก่า: ต้องแคบพอที่จะไม่ล้าง error จริง ────────────────────────
   🔴 18 ก.ย. 2569: แถวที่หลุดจากแผนไม่มีอะไรเขียนทับ ⇒ ต้องกวาดย้อนหลังครั้งเดียว
   ⚠️ ตัวแก้ที่กว้างเกินไปจะลบของจริงแล้วไม่มีตัวตรวจไหนจับได้อีก [[fixes-can-destroy-truth]]
      ⇒ ด่านนี้ดูสองอย่าง: เงื่อนไขต้องมีทั้ง "ทิศลง" และ "allowClose"
        และคำสั่ง UPDATE ต้องแตะแค่ last_error/last_error_at */
test('ล้างคำเท็จ: เงื่อนไขต้องแคบ และห้ามแตะคอลัมน์อื่น', async () => {
  const { ล้างคำเท็จในlast_error } = await import('../../netlify/lib/stock-push-sweep.mjs');
  คำสั่ง.length = 0;
  await ล้างคำเท็จในlast_error();
  const up = คำสั่ง.find((c) => /UPDATE push_state/.test(c.sql));
  /* mock coreQuery คืน [] ⇒ ไม่มีแถวเข้าเงื่อนไข ⇒ ต้อง **ไม่ยิง UPDATE เลย**
     (ถ้ายิง แปลว่ามันเขียนโดยไม่ได้อ่านก่อน = เขียนทับโดยไม่รู้ว่าทับอะไร) */
  assert.equal(up, undefined, 'ไม่มีแถวเข้าเงื่อนไข ⇒ ห้ามยิง UPDATE');
  const sel = คำสั่ง.find((c) => /SELECT sku, channel, last_error/.test(c.sql));
  assert.ok(sel, 'ต้องอ่านก่อนเขียนเสมอ');
  assert.match(sel.sql, /ทิศลง/, 'เงื่อนไขต้องระบุคำว่าทิศลง');
  assert.match(sel.sql, /allowClose/, 'เงื่อนไขต้องระบุ allowClose ด้วย — คำเดียวกว้างเกินไป');
  assert.doesNotMatch(sel.sql, /skip_reason\s*=/, 'ห้ามแตะ skip_reason');
  assert.doesNotMatch(sel.sql, /pushed_qty\s*=|planned_qty\s*=/, 'ห้ามแตะเลขสต็อก');
});
