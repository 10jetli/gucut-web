// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-add-contact.test.mjs
// งานกระดาน t_mu0m97e5 ขั้น ② contact-add → ZORT Contact/AddContact · ทดสอบโดยไม่ยิงเน็ต
// ⚠️ ชื่อช่องมาจากเอกสาร ZORT API V4 ทางการ — เปลี่ยนเมื่อไหร่ต้องเปิดเอกสารยืนยันก่อน
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const blob = new Map();
mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async (k) => (blob.has(k) ? blob.get(k) : null),
  setJSON: async (k, v) => { blob.set(k, v); },
}) } });
delete process.env.ZORT_STORENAME; delete process.env.ZORT_APIKEY; delete process.env.ZORT_APISECRET;
let fetched = 0;
globalThis.fetch = async () => { fetched++; throw new Error('ห้ามยิงเน็ตในเทส'); };
const { zortAddContact } = await import('../../netlify/lib/zort-write.mjs');

test('โหมดซ้อม: ส่งชื่อช่องตามเอกสาร V4 · ช่องว่างไม่ส่ง · taxId → idnumber ตัดขีด', async () => {
  const r = await zortAddContact({ ref: 'C-1', code: 'CUS-001', name: 'ร้านทดสอบ', taxId: '0-4355-65000-66-8',
    phone: '0812345678', email: 'a@b.co', address: '', line: '@shop', group: 'VIP' });
  assert.equal(r.dryRun, true);
  assert.deepEqual(r.willSend, { code: 'CUS-001', name: 'ร้านทดสอบ', idnumber: '0435565000668',
    email: 'a@b.co', phone: '0812345678', line: '@shop' });
  assert.equal(fetched, 0);
});

test('ด่านก่อนถึง ZORT: ref · code/name · เลขภาษีผิดหลัก · อีเมลผิดรูป', async () => {
  const base = { ref: 'C-2', code: 'X', name: 'x' };
  assert.match((await zortAddContact({ ...base, ref: '' })).error, /ref/);
  assert.match((await zortAddContact({ ...base, code: '' })).error, /code/);
  assert.match((await zortAddContact({ ...base, name: '  ' })).error, /name/);
  assert.match((await zortAddContact({ ...base, taxId: '123' })).error, /13 หลัก/);
  assert.match((await zortAddContact({ ...base, email: 'ไม่ใช่อีเมล' })).error, /อีเมล/);
});

test('ยืนยันส่งจริงแต่ไม่มีรหัส ZORT ⇒ ไม่รายงานสำเร็จ ไม่จดกันซ้ำ ไม่ยิงเน็ต', async () => {
  const r = await zortAddContact({ ref: 'C-REAL', code: 'CUS-9', name: 'x', confirm: true });
  assert.equal(r.ok, false);
  assert.equal(r.added, undefined);
  assert.ok(![...blob.keys()].some((k) => k.includes('C-REAL')), 'ยิงไม่สำเร็จห้ามจดว่าเคยบันทึก');
  assert.equal(fetched, 0);
});
