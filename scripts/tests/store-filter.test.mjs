// รัน: node --experimental-test-module-mocks --test scripts/tests/store-filter.test.mjs
// 15 ก.ย. 2569 — ตัวกรองร้าน (store=) ของเส้นออเดอร์ต้องตีความชุดเดียวกันทุกฟังก์ชัน
// 🔴 สิ่งที่เฝ้า: store=all ที่ orderfacets เคยได้ 0 ใบพร้อมป้าย "เฉพาะร้าน all" ขณะที่ list=orders ได้ครบ
//    และค่าที่ไม่รู้จัก (zzz · source=) ต้องถูกตีกลับที่ core.mjs ไม่ใช่ "ไม่กรอง" หรือ "กรองได้ 0" เงียบ ๆ
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let sqls = [];
let paramsOf = new Map();
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql); sqls.push(s); paramsOf.set(s, params);
    return [];
  },
} });

const { parseStore, listOrderFacets, listOrders, listChannels } = await import('../../netlify/lib/core-orders.mjs');

const filtersStore = () => sqls.some((s) => /source = \?/.test(s));

test('parseStore: ว่าง/all = ทุกร้าน · z1/z2 = ร้านนั้น · ค่าอื่น = error', () => {
  assert.deepEqual(parseStore(undefined), { source: null });
  assert.deepEqual(parseStore(null), { source: null });
  assert.deepEqual(parseStore(''), { source: null });
  assert.deepEqual(parseStore('all'), { source: null });
  assert.deepEqual(parseStore('z1'), { source: 'z1' });
  assert.deepEqual(parseStore(' z2 '), { source: 'z2' });
  for (const bad of ['zzz', 'Z1', 'source', 'z3']) assert.ok(parseStore(bad).error, `ต้อง error: ${bad}`);
});

test('orderfacets + store=all ⇒ ไม่กรองร้าน · ป้ายไม่ใช่ "เฉพาะร้าน all"', async () => {
  for (const v of ['all', 'zzz']) {
    sqls = []; paramsOf = new Map();
    const r = await listOrderFacets({ from: '2025-05-01', to: '2025-05-31', source: v });
    assert.equal(filtersStore(), false, `store=${v} ต้องไม่ใส่ source = ? ลง SQL`);
    assert.doesNotMatch(String(r.storeScope), /เฉพาะร้าน/, `store=${v} ป้ายต้องเป็นทุกร้าน`);
    assert.equal(r.store ?? null, null);
  }
});

test('orderfacets + z1 ⇒ กรองด้วย z1 จริง (เทสต์แยกแยะได้)', async () => {
  sqls = []; paramsOf = new Map();
  const r = await listOrderFacets({ from: '2025-05-01', to: '2025-05-31', source: 'z1' });
  const s = sqls.find((x) => /source = \?/.test(x));
  assert.ok(s, 'ต้องกรองร้าน');
  assert.ok(paramsOf.get(s).includes('z1'));
  assert.match(String(r.storeScope), /เฉพาะร้าน/);
});

test('listOrders / listChannels + all ⇒ ไม่กรองร้านเหมือน orderfacets', async () => {
  sqls = []; await listOrders({ from: '2025-05-01', to: '2025-05-31', source: 'all' });
  assert.equal(filtersStore(), false);
  sqls = []; await listChannels('all');
  assert.equal(filtersStore(), false);
  sqls = []; await listChannels('z2');
  assert.equal(filtersStore(), true);
});

test('core.mjs ตีกลับค่าร้านที่ไม่รู้จัก ก่อนถึงเส้น orderfacets/orders', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const guard = src.indexOf('const st = parseStore(p.get("store"))');
  const facets = src.indexOf('if (p.get("list") === "orderfacets") {');
  const orders = src.indexOf('if (p.get("list") === "orders") {');
  assert.ok(guard > 0 && facets > guard && orders > guard, 'ด่านต้องอยู่ก่อนทั้งสองเส้น');
  const block = src.slice(guard - 700, facets);
  assert.match(block, /st\.error\) return json\(\{ error: st\.error \}, 400\)/);
  assert.match(block, /p\.has\("source"\) && !p\.has\("store"\)/);
});

test('parseSingleStore: ว่าง = z1 (ค่าเดิม) · z1/z2 · all/ค่าแปลก = error ห้ามตกเป็น z1', async () => {
  const { parseSingleStore } = await import('../../netlify/lib/core-orders.mjs');
  assert.deepEqual(parseSingleStore(undefined), { source: 'z1', defaulted: true });
  assert.deepEqual(parseSingleStore(''), { source: 'z1', defaulted: true });
  assert.deepEqual(parseSingleStore('z1'), { source: 'z1', defaulted: false });
  assert.deepEqual(parseSingleStore('z2'), { source: 'z2', defaulted: false });
  for (const bad of ['all', 'zzz', 'Z2']) {
    const r = parseSingleStore(bad);
    assert.ok(r.error, `ต้อง error: ${bad}`);
    assert.equal(r.source, undefined, `${bad} ต้องไม่ได้ร้านไหนกลับมา`);
  }
});

test('core.mjs ไม่เหลือจุดที่ปัดค่าร้านเองเงียบ ๆ — ทุกเส้นผ่านตัวแปลงกลาง', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  assert.equal(src.includes('get("store") === "z2" ? "z2" : "z1"'), false, 'ห้ามตก z1 เงียบ');
  assert.equal(/\["z1", "z2"\]\.includes\(url\.searchParams\.get\("store"\)\)\s*\?/.test(src), false, 'ห้ามเหมาทุกร้านเงียบ');
  const single = src.match(/parseSingleStore\(url\.searchParams\.get\("store"\)\)/g) || [];
  const multi = src.match(/\.parseStore\(url\.searchParams\.get\("store"\)\)/g) || [];
  assert.equal(single.length, 3, 'ordercheck · pending · cardguess');
  assert.equal(multi.length, 2, 'daily/bycustomer · monthly');
  assert.equal((src.match(/if \(storeParsed\.error\) return json\(\{ error: storeParsed\.error \}, 400\);/g) || []).length, 5);
});

test('parseZ1OnlyStore: ว่าง/z1 = z1 · z2/all/ค่าแปลก = error ห้ามตอบของ z1 ในชื่อร้านอื่น', async () => {
  const { parseZ1OnlyStore, Z1_ONLY_SCOPE } = await import('../../netlify/lib/core-orders.mjs');
  assert.deepEqual(parseZ1OnlyStore(undefined), { source: 'z1' });
  assert.deepEqual(parseZ1OnlyStore(''), { source: 'z1' });
  assert.deepEqual(parseZ1OnlyStore('z1'), { source: 'z1' });
  for (const bad of ['z2', 'all', 'zzz']) {
    const r = parseZ1OnlyStore(bad);
    assert.ok(r.error, `ต้อง error: ${bad}`);
    assert.equal(r.source, undefined);
  }
  assert.match(parseZ1OnlyStore('z2').error, /ยังไม่ได้ดึง/);
  assert.equal(Z1_ONLY_SCOPE.store, 'z1');
  assert.match(Z1_ONLY_SCOPE.storeScope, /z1/);
});

test('core.mjs สี่เส้นที่มีแค่ z1: ด่านอยู่ก่อนทุกเส้น และทุกคำตอบติดขอบเขต', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const guard = src.indexOf('const Z1_ONLY_LISTS = ["purchases", "quotations", "returnorders", "transfers"];');
  assert.ok(guard > 0, 'ต้องมีรายชื่อสี่เส้น');
  const gblock = src.slice(guard, guard + 800);
  assert.match(gblock, /if \(z1\.error\) return json\(\{ error: z1\.error, \.\.\.Z1_ONLY_SCOPE \}, 400\);/);
  assert.match(gblock, /url\.searchParams\.has\("source"\) && !url\.searchParams\.has\("store"\)/);
  for (const k of ['purchases', 'quotations', 'returnorders', 'transfers']) {
    const at = src.indexOf(`if (url.searchParams.get("list") === "${k}") {`);
    assert.ok(at > guard, `${k} ต้องอยู่หลังด่าน`);
    // เนื้อของเส้นนี้ = ตั้งแต่หัวเส้นถึงหัวเส้นถัดไป (ไม่ใช้หน้าต่างตายตัว — คอมเมนต์ยาวจะดันโค้ดหลุดหน้าต่าง)
    const next = src.indexOf('if (url.searchParams.get(', at + 10);
    const body = src.slice(at, next > at ? next : at + 4000);
    assert.match(body, /\.\.\.z1Scope/, `${k} ต้องติดขอบเขตในคำตอบ`);
  }
});
