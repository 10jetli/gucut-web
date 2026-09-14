// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-lines-total.test.mjs
// งานกระดาน t_mu11n7mh — addpo · addquotation คืน linesTotal ในโหมดซ้อม ให้จอเทียบยอดท่อกับยอดจอ (ZORT ปลอม ไม่ยิงเน็ตจริง)
// 🔴 null ≠ 0: บรรทัดไม่มีราคา = ท่อไม่คิดยอด ⇒ ต้องเป็น null ไม่งั้นจอจะขึ้น "ยอดไม่ตรง" ทั้งที่แค่เทียบไม่ได้
// 🔴 linesTotal อยู่ในคำตอบซ้อมเท่านั้น — ห้ามรั่วเข้า body ที่ส่ง ZORT
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('@netlify/blobs', { namedExports: { getStore: () => ({
  get: async () => null,
  setJSON: async () => {},
}) } });
process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
let calls = 0;
globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => ({ res: { resCode: '200' } }) }; };
const { zortAddPurchaseOrder, zortAddQuotation } = await import('../../netlify/lib/zort-write.mjs');

const priced = [{ sku: '00313', name: 'หัวเทียน', qty: 3, price: 45.5 }, { sku: '01209', name: 'โซ่', qty: 2, price: 100 }];
const unpriced = [{ sku: '00313', name: 'หัวเทียน', qty: 3, price: 45.5 }, { sku: '01209', name: 'โซ่', qty: 2 }];

for (const [label, fn, extra] of [
  ['addpo', zortAddPurchaseOrder, {}],
  ['addquotation', zortAddQuotation, { customer: 'ร้าน ก' }],
]) {
  test(`${label}: ทุกบรรทัดมีราคา ⇒ linesTotal = ผลรวม qty×price (336.5) และเท่ากับ amount ที่จะส่ง`, async () => {
    calls = 0;
    const r = await fn({ ref: `${label}-1`, items: priced, ...extra });
    assert.equal(r.dryRun, true);
    assert.equal(r.linesTotal, 336.5);
    assert.equal(r.willSend.amount, 336.5);
    assert.equal(calls, 0, 'โหมดซ้อมต้องไม่ยิงเน็ต');
  });

  test(`${label}: มีบรรทัดไม่มีราคา ⇒ linesTotal = null (ไม่ใช่ 0) และไม่ส่ง amount`, async () => {
    const r = await fn({ ref: `${label}-2`, items: unpriced, ...extra });
    assert.equal(r.dryRun, true);
    assert.strictEqual(r.linesTotal, null);
    assert.equal('amount' in r.willSend, false);
  });

  test(`${label}: linesTotal ไม่รั่วเข้า body ที่ส่ง ZORT`, async () => {
    const r = await fn({ ref: `${label}-3`, items: priced, ...extra });
    assert.equal('linesTotal' in r.willSend, false);
  });
}
