// รัน: node --experimental-test-module-mocks --test scripts/tests/โฆษณา-200แต่อ่านไม่ได้.test.mjs
// B14 — HTTP 200 แต่ body อ่านไม่ได้ ⇒ ได้ "ไม่มีแคมเปญ · ค่าโฆษณา ฿0" แทน "อ่านไม่ได้"
//
// 🔴 ของเดิมทั้งสองเจ้า: `const body = await r.json().catch(() => null)`
//    แล้วตรวจแค่ `if (!r.ok) throw` ⇒ **200 ผ่านด่านไปทั้งที่ body เป็น null**
//    · Facebook: `(body?.data || []).map(...)`      ⇒ rows = []
//    · Google:   `chunks = [null]` → `chunk?.results || []` ⇒ rows = []
//    ⇒ หน้า `/admin/ads/` ได้ `{ok:true, rows:[]}` = **"วันนี้ไม่ได้ยิงโฆษณา · ใช้เงิน ฿0"**
//
// 🔑 ทำไมอันตรายกว่าหน้าว่าง: ตัวหารของ ROAS เป็น 0 ⇒ **ผลตอบแทนเป็นอนันต์**
//    ⇒ เร่งงบจากเลขปลอม · และ "ไม่มีแคมเปญ" เป็นคำตอบที่ **ดูสมเหตุสมผล** ในวันที่หยุดยิงจริง
//    ⇒ ไม่มีใครสงสัย (คลาส http-200-empty-payload · blank-input-invents-output)
//
// 🔑 ต้อง **ตกกับโค้ดเดิม** ไม่งั้นไม่ได้ทดสอบอะไร
//    พิสูจน์แล้ว 3 ต.ค. 2569: โค้ดเดิม ⇒ ตก 3 ข้อ · ตัวแก้ ⇒ ผ่าน 6/6
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('@netlify/blobs', {
  namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {}, delete: async () => {} }) },
});

// ตัวปลอมของ fetch — ตั้งได้ว่าจะให้ตอบอะไร
let ตอบ = { status: 200, json: async () => ({}) };
globalThis.fetch = async () => ({
  ok: ตอบ.status >= 200 && ตอบ.status < 300,
  status: ตอบ.status,
  json: ตอบ.json,
});

const { facebookInsights } = await import('../../netlify/lib/adstats.mjs');
const { googleInsights } = await import('../../netlify/lib/googleads.mjs');

const ช่วง = { since: '2026-10-01', until: '2026-10-03' };
const cfgGoogle = {
  developerToken: 'd', clientId: 'c', clientSecret: 's',
  refreshToken: 'r', customerId: '1234567890', loginCustomerId: '',
};

// Google ต้องขอ access token ก่อน ⇒ ให้รอบแรกสำเร็จ รอบถัดไปใช้ค่าที่ตั้ง
function ลำดับคำตอบ(...ชุด) {
  let i = 0;
  globalThis.fetch = async () => {
    const t = ชุด[Math.min(i++, ชุด.length - 1)];
    return { ok: t.status >= 200 && t.status < 300, status: t.status, json: t.json };
  };
}

test('B14 · Facebook ตอบ 200 แต่ body อ่านไม่ออก ⇒ ต้องโยน ไม่ใช่คืนแถวว่าง', async () => {
  ตอบ = { status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
  await assert.rejects(
    () => facebookInsights({ accountId: '1', token: 't', ...ช่วง }),
    (e) => /อ่าน|ไม่ได้|ไม่รู้/.test(String(e.message)),
    'อ่านคำตอบไม่ได้ ต้องบอกว่าอ่านไม่ได้ ห้ามคืน rows ว่างให้จอแปลว่า "ไม่มีแคมเปญ"',
  );
});

test('B14 · Facebook ตอบ 200 เป็น JSON ถูกแต่ไม่มีช่อง data ⇒ ต้องโยน', async () => {
  ตอบ = { status: 200, json: async () => ({ paging: {} }) };
  await assert.rejects(() => facebookInsights({ accountId: '1', token: 't', ...ช่วง }));
});

test('ตัวควบคุมลบ · Facebook ไม่มีแคมเปญจริง (data: []) ⇒ ต้องสำเร็จและได้ 0 แถว', async () => {
  ตอบ = { status: 200, json: async () => ({ data: [] }) };
  const rows = await facebookInsights({ accountId: '1', token: 't', ...ช่วง });
  assert.equal(rows.length, 0, 'ไม่มีแคมเปญจริงคือคำตอบที่ถูกต้อง ห้ามโยน');
});

test('ตัวควบคุมลบ · Facebook มีแคมเปญ ⇒ อ่านค่าได้ปกติ', async () => {
  ตอบ = {
    status: 200,
    json: async () => ({ data: [{ campaign_name: 'ก', spend: '12.5', impressions: '100', clicks: '3' }] }),
  };
  const rows = await facebookInsights({ accountId: '1', token: 't', ...ช่วง });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].spend, 12.5);
});

test('B14 · Google ตอบ 200 แต่ body อ่านไม่ออก ⇒ ต้องโยน ไม่ใช่คืนแถวว่าง', async () => {
  ลำดับคำตอบ(
    { status: 200, json: async () => ({ access_token: 'a', expires_in: 3600 }) },
    { status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } },
  );
  await assert.rejects(
    () => googleInsights(cfgGoogle, ช่วง),
    (e) => /อ่าน|ไม่ได้|ไม่รู้/.test(String(e.message)),
  );
});

test('ตัวควบคุมลบ · Google ไม่มีแถวจริง (results: []) ⇒ ต้องสำเร็จและได้ 0 แถว', async () => {
  ลำดับคำตอบ(
    { status: 200, json: async () => ({ access_token: 'a', expires_in: 3600 }) },
    { status: 200, json: async () => [{ results: [] }] },
  );
  const rows = await googleInsights(cfgGoogle, ช่วง);
  assert.equal(rows.length, 0);
});
