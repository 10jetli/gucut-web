// รัน: node --experimental-test-module-mocks --test scripts/tests/quotations-page.test.mjs
// 15 ก.ย. 2569 — ?list=quotations ต้องส่ง page ต่อให้ ZORT (เดิมส่งแค่ limit ⇒ หน้า 2 ขึ้นไปได้ก้อนเดิม)
// คลาสเดียวกับ returnorders (t_mtzx0wp4) · ฝั่งจอจับได้ตอนทำด่าน "หน้าไม่ขยับ" ใบ t_mu2mc4jj
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x';
const { listQuotations } = await import('../../netlify/lib/core-purchases.mjs');

const withFetch = async (fn) => {
  const saved = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (u) => {
    urls.push(new URL(String(u)));
    return { ok: true, json: async () => ({ count: 6, list: [{ id: 1, number: 'QT-1' }] }) };
  };
  try { return await fn(urls); } finally { globalThis.fetch = saved; }
};

test('page ถึง ZORT จริง · ไม่ใส่ = 1 · ขยะ = 1 · ถูกบีบในเพดาน', async () => {
  await withFetch(async (urls) => {
    await listQuotations('2', '3');
    await listQuotations('2');
    await listQuotations('2', 'abc');
    await listQuotations('2', '999');
    assert.deepEqual(urls.map((u) => u.searchParams.get('page')), ['3', '1', '1', '50']);
    assert.ok(urls.every((u) => u.searchParams.get('limit') === '2'));
  });
});

test('เส้น list=quotations ใน core.mjs ส่ง page ต่อให้ listQuotations', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8');
  const start = src.indexOf('get("list") === "quotations"');
  assert.ok(start > 0, 'หาเส้น quotations ไม่เจอ');
  const next = src.indexOf('url.searchParams.get("list") ===', start + 10);
  const block = src.slice(start, next > 0 ? next : start + 800);
  /* ⚠️ ตรวจ "เจตนา" ไม่ใช่ตัวอักษรเป๊ะ ๆ — ของเดิมผูกกับรูปการเรียกทั้งบรรทัด
     ⇒ วันที่เพิ่มพารามิเตอร์ตัวที่สี่ (opts.type เพื่อสะท้อน ignored) เทสต์ตกทั้งที่ page ยังส่งถูก
     นั่นคือ **แดงลวงจากเทสต์ที่แน่นเกินไป** [[probe-fails-toward-alarm]] */
  assert.match(block, /listQuotations\(/, 'ต้องเรียก listQuotations');
  /* ⚠️ ตัดวงเล็บต้อง **นับคู่** — ตัดที่ ')' ตัวแรกจะได้แค่ `listQuotations(url.searchParams.get("limit")`
     แล้วเทสต์จะฟ้องว่าไม่ส่ง page ทั้งที่ส่งอยู่ (ผมเพิ่งเหยียบเองรอบนี้ · บทเรียนเดียวกับฝั่งจอเรื่อง regex หาปีกกาปิด) */
  const call = block.slice(block.indexOf('listQuotations('));
  let depth = 0, end = -1;
  for (let i = call.indexOf('('); i < call.length; i++) {
    if (call[i] === '(') depth++;
    else if (call[i] === ')' && --depth === 0) { end = i; break; }
  }
  assert.ok(end > 0, 'อ่านวงเล็บของการเรียกไม่จบ');
  const args = call.slice(0, end + 1);
  assert.match(args, /get\("limit"\)/, 'ต้องส่ง limit');
  assert.match(args, /get\("page"\)/, '🔴 ต้องส่ง page ต่อให้ ZORT — ไม่ส่ง = ได้ก้อนเดิมทุกหน้า');
  assert.ok(args.indexOf('get("limit")') < args.indexOf('get("page")'), 'ลำดับต้องเป็น (limit, page, ...)');
});
