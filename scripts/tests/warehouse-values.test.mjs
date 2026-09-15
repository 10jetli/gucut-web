// รัน: node --experimental-test-module-mocks --test scripts/tests/warehouse-values.test.mjs
// 15 ก.ย. 2569 — มูลค่าคงเหลือ + เคลื่อนไหวล่าสุดต่อคลัง (คัดจากจอ ZORT) · ใบ t_mu28f6z0
// 🔴 สิ่งที่เฝ้า: วันไทย พ.ศ. แปลงเป็น UTC ถูก · แถวเสียแถวเดียวไม่เขียนเลย · อ่าน D1 พลาดต้องไม่กลายเป็น 0 หรือ "ยังไม่เคยคัด"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mock, test } from 'node:test';

let writes = [];
let readMode = 'rows';
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql);
    if (/^\s*INSERT INTO warehouse_values/.test(s)) { writes.push(params); return []; }
    if (/^\s*CREATE TABLE/.test(s)) return [];
    if (/FROM warehouse_values/.test(s)) {
      if (readMode === 'fail') throw new Error('D1 500: overloaded');
      if (readMode === 'notable') throw new Error('D1 400: no such table: warehouse_values');
      return [{ code: 'NEW', value: 16305522.84, last_movement_at: '2026-09-15T11:48:00+07:00', collected_at: '2026-09-15 05:34:40' }];
    }
    return [];
  },
} });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';

const wv = await import('../../netlify/lib/warehouse-values.mjs');
const { listWarehouses } = await import('../../netlify/lib/core-purchases.mjs');

test('parseThaiDateTime: เวลาไทย พ.ศ. → ISO +07:00 · อ่านไม่ได้/วันไม่มีจริง = null', () => {
  assert.equal(wv.parseThaiDateTime('15 ก.ย. 2569 11:48'), '2026-09-15T11:48:00+07:00');
  assert.equal(wv.parseThaiDateTime('13 มี.ค. 2568 11:51'), '2025-03-13T11:51:00+07:00');
  const early = wv.parseThaiDateTime('1 ม.ค. 2569 03:00');
  assert.equal(early.slice(0, 10), '2026-01-01', 'จอตัดสิบตัวแรก — ตีสามเวลาไทยต้องยังเป็นวันที่ 1 ไม่ใช่เมื่อวาน');
  assert.equal(new Date(early).toISOString(), '2025-12-31T20:00:00.000Z', 'แต่ต้องเป็นเวลาที่แน่นอน แปลงเป็น UTC ได้ถูก');
  for (const bad of ['', '15 Sep 2026 11:48', '31 ก.พ. 2569 10:00', '15 ก.ย. 2026 11:48', '15 ก.ย. 2569 25:00', null]) {
    assert.equal(wv.parseThaiDateTime(bad), null, `ต้อง null: ${bad}`);
  }
});

test('parseZortNumber: ลูกน้ำ · ศูนย์ · ของเสีย', () => {
  assert.equal(wv.parseZortNumber('16,305,522.84'), 16305522.84);
  assert.equal(wv.parseZortNumber('0'), 0);
  assert.equal(wv.parseZortNumber('1,562.32'), 1562.32);
  for (const bad of ['', '-', '฿1,000', 'N/A', null, undefined]) assert.equal(wv.parseZortNumber(bad), null, `ต้อง null: ${bad}`);
});

test('saveWarehouseValues: ชุดดีเขียนครบ · แถวเสียแถวเดียว = ไม่เขียนเลย', async () => {
  writes = [];
  const ok = await wv.saveWarehouseValues([
    { code: 'NEW', value: '16,305,522.84', lastMovement: '15 ก.ย. 2569 11:48' },
    { code: 'KLD', value: '1,562.32', lastMovement: '25 ส.ค. 2569 13:45' },
    { code: 'ANJ', value: '0', lastMovement: '13 มี.ค. 2568 11:51' },
  ]);
  assert.equal(ok.saved, 3);
  assert.equal(ok.total, 16307085.16);
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[2], ['ANJ', 0, '2025-03-13T11:51:00+07:00'], 'มูลค่า 0 จริงต้องเก็บเป็น 0');

  for (const badSet of [
    [{ code: 'NEW', value: '16,305,522.84', lastMovement: '15 ก.ย. 2569 11:48' }, { code: 'KLD', value: '', lastMovement: '' }],
    [{ code: 'NEW', value: '1', lastMovement: 'เมื่อวานนี้' }],
    [{ code: 'NEW', value: '1' }, { code: 'NEW', value: '2' }],
    [{ code: 'NE W', value: '1' }],
  ]) {
    writes = [];
    const r = await wv.saveWarehouseValues(badSet);
    assert.ok(r.error, 'ต้อง error');
    assert.equal(writes.length, 0, 'ต้องไม่เขียนสักแถว');
  }
  assert.ok((await wv.saveWarehouseValues([])).error);
  assert.ok((await wv.saveWarehouseValues(null)).error);
});

test('listWarehouses: เติมค่าที่คัด · ยังไม่เคยคัด = null · อ่าน D1 พลาด = valuesError ไม่ใช่ 0', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ list: [
    { id: 1, code: 'NEW', name: 'โกดัง', address: 'x' },
    { id: 2, code: 'KLD', name: 'KLD', address: 'y' },
  ] }) });
  readMode = 'rows';
  let r = await listWarehouses();
  assert.equal(r.valuesError, null);
  assert.deepEqual(r.zortFields, ['address', 'code', 'id', 'name']);
  const neww = r.warehouses.find((w) => w.code === 'NEW');
  const kld = r.warehouses.find((w) => w.code === 'KLD');
  assert.equal(neww.stockValue, 16305522.84, 'ชื่อช่องต้องตรงกับที่จอสาขารอ');
  assert.equal(neww.movedAt, '2026-09-15T11:48:00+07:00');
  assert.equal(neww.valueCollectedAt, '2026-09-15 05:34:40');
  assert.equal('value' in neww, false, 'ห้ามส่งชื่อ value ที่จอไม่รู้จัก');
  assert.equal(kld.stockValue, null, 'คลังที่ยังไม่เคยคัด = null ห้ามเป็น 0');
  assert.equal(kld.movedAt, null);
  assert.ok(!JSON.stringify(r).includes('"x"'), 'ห้ามส่งค่าที่อยู่ออกไป');

  readMode = 'notable';
  r = await listWarehouses();
  assert.equal(r.valuesError, null, 'ยังไม่มีตาราง = ยังไม่เคยคัด ไม่ใช่ error');
  assert.equal(r.warehouses[0].stockValue, null);

  readMode = 'fail';
  r = await listWarehouses();
  assert.match(String(r.valuesError), /อ่านมูลค่า/);
  assert.ok(r.warehouses.every((w) => w.stockValue === null && w.movedAt === null), 'อ่านพลาด = null ทุกแถว ห้ามเป็น 0');
});

test('core.mjs มีเส้น POST ?warehousevalues ที่ส่งต่อให้ saveWarehouseValues', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const at = src.indexOf('if (url.searchParams.get("warehousevalues")) {');
  assert.ok(at > 0);
  const body = src.slice(at, at + 500);
  assert.match(body, /req\.method !== "POST"\) return json\(\{ error: "ต้องเป็น POST" \}, 405\)/);
  assert.match(body, /saveWarehouseValues\(body\.rows\)/);
  const gate = src.indexOf('const gate = await adminGate(req, context);');
  assert.ok(gate > 0 && gate < at, 'ต้องอยู่หลังด่านรหัสหลังร้าน');
});
