// รัน: node --experimental-test-module-mocks --test scripts/tests/transfers-store.test.mjs
// 15 ก.ย. 2569 · ใบ t_mu2pfve9 — กระจกใบโอนแยกร้าน (z2 มีใบโอน 15,514 ใบที่ไม่เคยดึง)
// 🔴 สิ่งที่เฝ้า: z2 ใช้รหัสชุด _2 · อ่านของเดิมเฉพาะร้านตัวเอง · id ที่เป็นของอีกร้าน **ไม่เขียนทับ** และรายงาน ·
//    แถวที่เขียนติดร้าน · ALTER ล้มด้วยเหตุอื่นต้องโยน · จอรายการกรองร้านทุกคำสั่ง · เส้นใน core.mjs ตอบทีละร้าน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { readFileSync } from 'node:fs';

let sqls = [];
let alterErr = null;
let clashIds = [];
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    const s = String(sql); sqls.push(s);
    if (/^ALTER TABLE transfers ADD COLUMN source/.test(s)) { if (alterErr) throw new Error(alterErr); return []; }
    if (/SELECT id FROM transfers WHERE id IN/.test(s)) return clashIds.map((id) => ({ id }));
    if (/SELECT COUNT\(\*\) AS c, MIN\(transfer_date\)/.test(s)) return [{ c: 3, oldest: '2026-09-01' }];
    return [];
  },
} });
process.env.ZORT_STORENAME = 'shop1'; process.env.ZORT_APIKEY = 'k1'; process.env.ZORT_APISECRET = 's1';
process.env.ZORT_STORENAME_2 = 'shop2'; process.env.ZORT_APIKEY_2 = 'k2'; process.env.ZORT_APISECRET_2 = 's2';

const { syncTransfers, listTransfers, resetTransfers } = await import('../../netlify/lib/core-purchases.mjs');
const today = new Date().toISOString().slice(0, 10);
let seenStore = [];
globalThis.fetch = async (url, init) => {
  seenStore.push(init?.headers?.storename);
  return { ok: true, json: async () => ({ list: [
    { id: 10, number: 'TF-1', transferType: 'Transfer', status: 'Success', transferdate: today },
    { id: 11, number: 'TF-2', transferType: 'Adjust', status: 'Success', transferdate: today },
  ] }) };
};

test('ซิงก์ z2 — ใช้รหัส _2 · อ่านของเดิมเฉพาะ z2 · id ของอีกร้านไม่เขียนทับและรายงาน · แถวติดร้าน z2', async () => {
  await resetTransfers(); sqls = []; alterErr = null; clashIds = ['11']; seenStore = [];
  const r = await syncTransfers(30, { store: 'z2' });
  assert.deepEqual([...new Set(seenStore)], ['shop2']);
  assert.ok(sqls.some((s) => /FROM transfers WHERE transfer_date >= '.*' AND source = 'z2'/.test(s)), 'อ่านของเดิมต้องกรองร้าน');
  const ins = sqls.find((s) => /^\s*INSERT INTO transfers/.test(s));
  assert.ok(ins, 'ต้องมีคำสั่งเขียน');
  assert.match(ins, /'10'/);
  assert.doesNotMatch(ins, /'11'/, 'id ที่เป็นของอีกร้านห้ามอยู่ในคำสั่งเขียน');
  assert.match(ins, /,'z2'\)/);
  assert.match(ins, /WHERE transfers\.source = excluded\.source/);
  assert.equal(r.store, 'z2'); assert.equal(r.collisions, 1); assert.deepEqual(r.collisionIds, ['11']); assert.equal(r.written, 1);
});

test('store แปลก = error ไม่ยิง ZORT · ALTER ล้มเพราะคอลัมน์มีแล้ว = ผ่าน · ล้มเหตุอื่น = โยน', async () => {
  seenStore = [];
  assert.match((await syncTransfers(30, { store: 'all' })).error, /z1 หรือ z2/);
  assert.equal(seenStore.length, 0);
  await resetTransfers(); alterErr = 'D1 400: [{"message":"duplicate column name: source"}]'; clashIds = [];
  await assert.doesNotReject(syncTransfers(30, { store: 'z1' }));
  await resetTransfers(); alterErr = 'D1 500: [{"message":"database is locked"}]';
  await assert.rejects(syncTransfers(30, { store: 'z1' }), /locked/);
  alterErr = null;
});

test('จอรายการ — ทุกคำสั่งกรองร้าน · ไม่ระบุ = z1 · ระบุ z2 = z2', async () => {
  await resetTransfers(); sqls = [];
  const a = await listTransfers({});
  assert.equal(a.store, 'z1');
  const reads = sqls.filter((s) => /FROM transfers WHERE 1=1/.test(s));
  assert.equal(reads.length, 4);
  assert.ok(reads.every((s) => /AND source = 'z1'/.test(s)), 'ทุกคำสั่งอ่านต้องกรองร้าน');
  sqls = [];
  const b = await listTransfers({ store: 'z2', q: 'TF-9' });
  assert.equal(b.store, 'z2');
  assert.ok(sqls.filter((s) => /FROM transfers WHERE 1=1/.test(s)).every((s) => /AND source = 'z2' AND \(/.test(s)));
});

test('core.mjs — transfers ออกจาก Z1_ONLY · list/sync ใช้ parseSingleStore · คำตอบมี storeScope', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  // ตรึงแค่ว่า transfers ไม่อยู่ในรายชื่อ — ชนิดอื่นจะทยอยออกจากรายชื่อตามมา ห้ามตรึงทั้งบรรทัด
  assert.doesNotMatch(src, /Z1_ONLY_LISTS = \[[^\]]*"transfers"/);
  const at = src.indexOf('if (url.searchParams.get("list") === "transfers") {');
  const bodyดิบ = src.slice(at, src.indexOf('if (url.searchParams.get("list") === "warehouses")', at));
  /* 🔴 **ต้องตัดคอมเมนต์ออกก่อนตรวจรูปโค้ด** — เจอเอง 18 ก.ย. 2569
     ด่าน "ห้ามครอบ ok:true" ร้องใส่ **คอมเมนต์ที่อธิบายบั๊กนั้นเอง** (ซึ่งต้องพิมพ์รูปที่ห้าม)
     ⇒ ตัวตรวจที่อ่านซอร์สดิบ จะจับข้อความในคำอธิบายเสมอ ⇒ ยิ่งเขียนคำเตือนละเอียด ยิ่งแดงลวง */
  const body = bodyดิบ.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(body, /parseSingleStore\(url\.searchParams\.get\("store"\)\)/);
  assert.match(body, /if \(st\.error\) return json\(\{ error: st\.error \}, 400\);/);
  assert.match(body, /storeScope:/);
  assert.match(body, /store: st\.source,/);
  assert.doesNotMatch(body, /z1Scope/);
  /* 🔴 **ห้ามครอบ ok:true ทับคำตอบของ listTransfers** (เพิ่ม 18 ก.ย. 2569)
     เดิมเขียน `{ ok: true, ...(await listTransfers(...)) }` ⇒ วันที่ listTransfers เริ่มคืน
     `{ error }` จอจะได้ HTTP 200 + ok:true + error พร้อมกัน แล้วอ่านว่าสำเร็จ
     ⇒ ต้องตัดสิน error **ก่อน** แล้วตอบ 400
     ⚠️ ด่านนี้ตรวจรูปโค้ดเพราะเส้นทางนี้ทดสอบด้วยการเรียกจริงไม่ได้ (อยู่ใน handler ใหญ่)
        ⇒ เขียนให้ยึด "มีการเช็ค error แล้วตอบ 400" ไม่ใช่ยึดวงเล็บ (รูปวงเล็บเปลี่ยนได้) */
  assert.match(body, /ผล\?\.error[\s\S]{0,80}400\)/, 'ต้องเช็ค error ของ listTransfers แล้วตอบ 400');
  assert.doesNotMatch(body, /ok: true,\s*\.\.\.\(await listTransfers/, 'ห้ามครอบ ok:true ทับคำตอบ');
  /* ตัวกรองที่ฝั่งจอขอ ต้องถูกส่งต่อจริง ไม่ใช่แค่มีชื่อในเอกสาร */
  for (const k of ['status', 'from', 'to']) {
    assert.match(body, new RegExp(`${k}: url\\.searchParams\\.get\\("${k}"\\)`), `ต้องส่ง ${k} ต่อให้ listTransfers`);
  }
  const sy = src.indexOf('if (url.searchParams.get("synctransfers")) {');
  assert.match(src.slice(sy, at), /store: st\.source/);
});

/* ── ตัวกรอง status/from/to ของ list=transfers (เพิ่ม 18 ก.ย. 2569) ──────────────
   🔴 ฝั่งจอยิงพิสูจน์ว่าของเดิม **เมินเงียบ**: ส่ง from/to/days/page/status แล้ว total
      เท่าเดิม 12,005 ทุกครั้ง และ applied เป็น null ⇒ ปุ่มหลอกบนจอ
   ⚠️ กับดักที่ต้องเฝ้า: ตัวกรองสถานะต้อง **ไม่** ไปโดนตัวนับแท็บ (byStatus/byKind)
      ไม่งั้นเลือกแท็บหนึ่งแล้วแท็บอื่นขึ้น 0 ทั้งที่มีของ — คนอ่านว่า "ไม่มีใบยกเลิกแล้ว" */
test('list=transfers: status กรองแถว แต่ตัวนับแท็บต้องนับข้ามสถานะ', async () => {
  sqls = [];
  const r = await listTransfers({ status: 'Voided' });
  assert.equal(r.applied.status, 'Voided', 'ต้องประกาศว่าใช้ค่านี้จริง');
  const แถว = sqls.find((s) => /SELECT id, number, kind/.test(s));
  const แท็บ = sqls.find((s) => /GROUP BY status/.test(s));
  assert.match(แถว, /status = 'Voided'/, 'คำสั่งดึงแถวต้องกรองสถานะ');
  assert.doesNotMatch(แท็บ, /status = 'Voided'/, 'ตัวนับแท็บห้ามกรองสถานะ — ไม่งั้นแท็บอื่นขึ้น 0');
  const นับรวม = sqls.find((s) => /COUNT\(\*\) AS c, MIN\(transfer_date\)/.test(s));
  assert.match(นับรวม, /status = 'Voided'/, 'ตัวนับรวมต้องตรงกับแถวที่โชว์ ไม่งั้นแบ่งหน้าเพี้ยน');
});

test('list=transfers: from/to กรองด้วย transfer_date และประกาศ applied', async () => {
  sqls = [];
  const r = await listTransfers({ from: '2026-09-01', to: '2026-09-18' });
  assert.deepEqual([r.applied.from, r.applied.to], ['2026-09-01', '2026-09-18']);
  const แถว = sqls.find((s) => /SELECT id, number, kind/.test(s));
  assert.match(แถว, /date\(transfer_date\) >= date\('2026-09-01'\)/);
  assert.match(แถว, /date\(transfer_date\) <= date\('2026-09-18'\)/);
});

/* 🔴 ค่าที่ไม่รู้จัก **ต้องตีกลับ ห้ามเมินเงียบ** — เมินแล้วจอโชว์ทั้ง 12,005 ใบ
   ซึ่งอ่านได้ว่า "ไม่มีใบไหนถูกกรองออก" ทั้งที่จริงคือ "ท่อไม่ได้กรองให้" */
test('list=transfers: สถานะ/วันที่ผิดรูป ต้องตีกลับพร้อมบอกค่าที่รับ', async () => {
  const a = await listTransfers({ status: 'ยกเลิก' });      // คำไทยบนจอ ZORT ไม่ใช่ค่าในตาราง
  assert.match(String(a.error), /ไม่รู้จักสถานะ/);
  assert.deepEqual(a.supportedStatus, ['Success', 'Voided', 'Pending']);
  const b = await listTransfers({ from: '18/09/2026' });
  assert.match(String(b.error), /yyyy-MM-dd/);
});

/* ตัวกรองที่เรายังไม่รองรับ ต้องประกาศว่าเมิน ไม่ใช่เงียบ [[แท็บที่ส่งตัวกรองไปแล้วท่อเมิน]] */
test('list=transfers: days/page ต้องอยู่ใน ignored ไม่ใช่หายเงียบ', async () => {
  const r = await listTransfers({ days: 7, page: 3 });
  assert.deepEqual(r.ignored, { days: 7, page: 3 });
  assert.ok(r.supportedFilters.includes('status'), 'ต้องบอกจอว่ารับอะไรได้');
  assert.ok(!r.supportedFilters.includes('days'));
});
