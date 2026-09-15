// รัน: node --test scripts/tests/zort-document-rows.test.mjs
// 15 ก.ย. 2569 · t_mu2kxh4d — ท่อสารบัญเอกสารบัญชีรายแถว (ZORT ปลอมทั้งหมด)
// 🔴 สิ่งที่เฝ้า: แบ่งหน้า 694 ใบ · กรอง documenttype ที่ต้นทางก่อนแบ่งหน้า ·
//    คำตอบอ่านไม่ได้ต้องเป็น unknown ไม่ใช่รายการว่าง · เส้นสรุป zortdocs เดิมต้องไม่ถูกแทน
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.ZORT_STORENAME = 's';
process.env.ZORT_APIKEY = 'k';
process.env.ZORT_APISECRET = 'x';

const allRows = Array.from({ length: 694 }, (_, i) => ({
  id: i + 1,
  header: i < 58 ? 'ใบเสร็จรับเงิน' : 'ใบส่งสินค้า',
  documentnumber: `DOC-${String(i + 1).padStart(3, '0')}`,
  referencetype: i % 2 ? 1 : 2,
  detail: { source: i % 2 ? 'order' : 'purchase' },
}));
let calls = [];
let replyMode = 'fixture';

globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), method: init.method ?? 'GET' });
  if (replyMode === 'network') throw new Error('timeout');
  if (replyMode === 'html') return { ok: true, status: 200, text: async () => '<html>oops</html>' };
  if (replyMode === 'no-list') {
    return { ok: true, status: 200, text: async () => JSON.stringify({ res: { resCode: '200' }, count: 694 }) };
  }
  const q = new URL(String(url)).searchParams;
  const page = Number(q.get('page'));
  const limit = Number(q.get('limit'));
  const documenttype = q.get('documenttype');
  // fixture จำลอง ZORT: type=1 คือใบเสร็จ 58 ใบ; ตัวกรองเกิดก่อนแบ่งหน้า
  const source = documenttype === '1' ? allRows.slice(0, 58) : allRows;
  const list = source.slice((page - 1) * limit, page * limit);
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ res: { resCode: '200' }, count: source.length, list }),
  };
};

const { zortDocumentRows } = await import('../../netlify/lib/zort-document-rows.mjs');
const reset = () => { calls = []; replyMode = 'fixture'; };

test('694 ใบแบ่งหน้าโดย ZORT: หน้า 7 เหลือ 94 แถว · count/pages/hasMore ตรง · GET เท่านั้น', async () => {
  reset();
  const r = await zortDocumentRows({ page: 7, limit: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.count, 694);
  assert.equal(r.totalPages, 7);
  assert.equal(r.hasMore, false);
  assert.equal(r.rows.length, 94);
  assert.equal(r.rows[0].documentnumber, 'DOC-601');
  assert.deepEqual(r.rows[0].detail, { source: 'purchase' }, 'ต้องส่งแถวดิบรวม detail ให้ Export');
  assert.equal(calls.length, 1, 'เส้นรายแถวต้องถามเฉพาะหน้าที่ขอ ไม่กวาด 7 หน้าแบบเส้นสรุป');
  assert.equal(calls[0].method, 'GET');
  const q = new URL(calls[0].url).searchParams;
  assert.equal(q.get('page'), '7');
  assert.equal(q.get('limit'), '100');
  assert.equal(q.get('documenttype'), null);
});

test('type กรองด้วย documenttype ที่ ZORT ก่อนแบ่งหน้า — ไม่ใช้ referencetype/header กรองทีหลัง', async () => {
  reset();
  const r = await zortDocumentRows({ page: 2, limit: 50, type: 1 });
  assert.equal(new URL(calls[0].url).searchParams.get('documenttype'), '1');
  assert.equal(r.count, 58, 'count ต้องเป็นยอดหลังกรองจาก ZORT');
  assert.equal(r.rows.length, 8);
  assert.equal(r.rows[0].documentnumber, 'DOC-051');
  assert.deepEqual(r.applied, { page: 2, limit: 50, type: 1, typeLabel: 'ใบเสร็จรับเงิน' });
  assert.equal(r.hasMore, false);
});

test('type/page/limit ผิดปฏิเสธก่อนยิง · limit เกิน 200 บีบและบอกจอ', async () => {
  reset();
  for (const input of [{ type: 6 }, { type: 'tax' }, { page: 0 }, { page: '1.5' }, { limit: -1 }]) {
    const r = await zortDocumentRows(input);
    assert.equal(r.ok, false);
    assert.equal(r.unknown, undefined);
  }
  assert.equal(calls.length, 0);

  const clamped = await zortDocumentRows({ limit: 999 });
  assert.equal(new URL(calls[0].url).searchParams.get('limit'), '200');
  assert.equal(clamped.limitClamped, true);
  assert.equal(clamped.limitRequested, 999);
});

test('list ว่างจริงคือ rows [] · ไม่มี count ไม่เดาจากจำนวนแถว', async () => {
  reset();
  globalThis.fetch = async (url) => {
    calls.push({ url: String(url), method: 'GET' });
    return { ok: true, status: 200, text: async () => JSON.stringify({ res: { resCode: '200' }, list: [] }) };
  };
  const r = await zortDocumentRows({ page: 1, limit: 20, type: 'all' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, []);
  assert.equal(r.count, null);
  assert.equal(r.totalPages, null);
  assert.equal(r.hasMore, null);
  assert.equal(new URL(calls[0].url).searchParams.get('documenttype'), null);
});

test('เน็ตล้ม · JSON เสีย · ไม่มี list = unknown และห้ามแนบ rows/count ว่าง', async () => {
  for (const mode of ['network', 'html', 'no-list']) {
    reset(); replyMode = mode;
    // คืน fetch จำลองหลักกลับมา เพราะเทสต์ก่อนหน้าสลับฟังก์ชัน
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET' });
      if (replyMode === 'network') throw new Error('timeout');
      const body = replyMode === 'html'
        ? '<html>oops</html>'
        : JSON.stringify({ res: { resCode: '200' }, count: 694 });
      return { ok: true, status: 200, text: async () => body };
    };
    const r = await zortDocumentRows();
    assert.equal(r.ok, false, mode);
    assert.equal(r.unknown, true, mode);
    assert.equal(r.rows, undefined, `${mode}: ห้ามดูเหมือนรายการว่าง`);
    assert.equal(r.count, undefined, `${mode}: ห้ามดูเหมือนครบ 0`);
  }
});

test('route ใหม่แยกจาก zortdocs=1 และบังคับ GET โดยไม่เปลี่ยนตัวเรียกสรุปเดิม', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const rowsAt = src.indexOf('if (url.searchParams.has("zortdocrows"))');
  const summaryAt = src.indexOf('if (url.searchParams.get("zortdocs"))');
  assert.ok(rowsAt > 0 && summaryAt > rowsAt);
  const rowsBlock = src.slice(rowsAt, summaryAt);
  assert.match(rowsBlock, /req\.method !== "GET"/);
  assert.match(rowsBlock, /zortDocumentRows/);
  const summaryBlock = src.slice(summaryAt, src.indexOf('\n    if (url.searchParams.get(', summaryAt + 10));
  assert.match(summaryBlock, /zortDocumentsRead\(url\.searchParams\.get\("limit"\)\)/,
    'เส้นสรุปเดิมยังเรียกฟังก์ชันเดิมด้วยอาร์กิวเมนต์เดิม');
  assert.doesNotMatch(summaryBlock, /zortDocumentRows/);
});
