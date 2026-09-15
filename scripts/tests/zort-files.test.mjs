// รัน: node --test scripts/tests/zort-files.test.mjs
// 15 ก.ย. 2569 · งานกระดาน t_mu1xao7r — ?zortfiles= อ่านไฟล์แนบรายเอกสารจาก ZORT (ZORT ปลอมทั้งหมด)
// 🔴 สิ่งที่เฝ้า: ตัวไฟล์ต้องไม่หลุดออกในคำตอบ · ชนิดดูจากไบต์จริง (html ≠ ไฟล์) ·
//    อ่านรูปคำตอบไม่ออก/ยิงไม่ถึง = unknown ไม่ใช่ "ไม่มีไฟล์" · ZORT ปฏิเสธ = zortCode ไม่ใช่ unknown
import assert from 'node:assert/strict';
import { test } from 'node:test';

let calls = [];
let reply = null; // (url) => {status, text} | throw
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), headers: init.headers || {} });
  const r = reply(String(url));
  return { status: r.status ?? 200, text: async () => r.text };
};
const withZort = () => { process.env.ZORT_STORENAME = 's'; process.env.ZORT_APIKEY = 'k'; process.env.ZORT_APISECRET = 'x'; };
const noZort = () => { delete process.env.ZORT_STORENAME; delete process.env.ZORT_APIKEY; delete process.env.ZORT_APISECRET; };
const json = (o) => ({ status: 200, text: JSON.stringify(o) });

const { zortDocFiles, sniffBytes } = await import('../../netlify/lib/zort-files.mjs');

test('รายการไฟล์ของออเดอร์ด้วยเลขที่ใบ — ยิงเส้นถูก ส่งหัวรหัส แกะอาร์เรย์ตามเอกสาร', async () => {
  withZort(); calls = [];
  reply = () => json({ res: { resCode: '200' }, list: [{ id: 5, fileName: 'slip.jpg', type: 'image/jpeg' }] });
  const r = await zortDocFiles({ doc: 'order', docno: 'SO-1' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v4\/Order\/GetOrderFiles\?number=SO-1$/);
  assert.equal(calls[0].headers.storename, 's');
  assert.equal(r.ok, true);
  assert.equal(r.count, 1);
  assert.deepEqual(r.files, [{ id: 5, fileName: 'slip.jpg', type: 'image/jpeg' }]);
  assert.deepEqual(r.rowKeys, ['id', 'fileName', 'type']);
  assert.deepEqual(r.applied, { doc: 'order', docid: null, docno: 'SO-1', fileid: null, endpoint: 'Order/GetOrderFiles' });
});

test('คำตอบเป็นอาร์เรย์ชั้นบนสุด (FileContent) ก็อ่านได้ · docid มาก่อน docno', async () => {
  withZort(); calls = [];
  reply = () => json([{ id: 1, fileName: 'a.pdf', type: 'application/pdf' }, { id: 2, fileName: 'b.png', type: 'image/png' }]);
  const r = await zortDocFiles({ doc: 'purchaseorder', docid: '77', docno: 'PO-9' });
  assert.match(calls[0].url, /PurchaseOrder\/GetPurchaseOrderFiles\?id=77$/);
  assert.equal(r.count, 2);
  assert.equal(r.applied.docno, null);
});

test('รายละเอียดไฟล์: ชนิดดูจากไบต์จริง และ **ตัวไฟล์ไม่หลุดออกในคำตอบ**', async () => {
  withZort(); calls = [];
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString('base64');
  reply = () => json({ res: { resCode: '200' }, id: 5, fileName: 'slip.png', type: 'image/png', content: jpeg });
  const r = await zortDocFiles({ doc: 'returnorder', docid: 9, fileid: '5' });
  assert.match(calls[0].url, /ReturnOrder\/GetReturnOrderFileDetail\?id=9&fileid=5$/);
  assert.equal(r.ok, true);
  assert.equal(r.file.kind, 'jpeg', 'ต้องเชื่อไบต์ ไม่เชื่อ type/fileName ที่ ZORT บอก');
  assert.equal(r.file.bytes, 404);
  assert.equal(r.file.hasContent, true);
  assert.ok(!JSON.stringify(r).includes(jpeg.slice(0, 40)), 'ห้ามส่ง base64 ของสลิปลูกค้าออกไป');
  assert.deepEqual(r.fileKeys, ['id', 'fileName', 'type', 'content']);
});

test('ได้หน้าเว็บแทนไฟล์ ⇒ kind = html (บทเรียน Document linkurl)', async () => {
  withZort();
  reply = () => json({ detail: { id: 5, fileName: 'x.pdf', content: Buffer.from('<!DOCTYPE html><html>login</html>').toString('base64') } });
  const r = await zortDocFiles({ doc: 'order', docid: 1, fileid: 5 });
  assert.equal(r.file.kind, 'html');
  assert.equal(sniffBytes(Buffer.from('%PDF-1.7')), 'pdf');
  assert.equal(sniffBytes(Buffer.alloc(0)), 'empty');
});

test('ไม่มี content ⇒ hasContent false · bytes null (ไม่แกล้งเป็น 0)', async () => {
  withZort();
  reply = () => json({ id: 5, fileName: 'x.jpg', type: 'image/jpeg' });
  const r = await zortDocFiles({ doc: 'order', docid: 1, fileid: 5 });
  assert.equal(r.file.hasContent, false);
  assert.equal(r.file.bytes, null);
  assert.equal(r.file.kind, null);
});

test('ZORT ปฏิเสธ (resCode ≠ 200) ⇒ ok false + zortCode/zortDesc · ไม่ใช่ unknown', async () => {
  withZort();
  reply = () => json({ res: { resCode: '100', resDesc: 'Access Denied.' } });
  const r = await zortDocFiles({ doc: 'quotation', docno: 'QT-1' });
  assert.equal(r.ok, false);
  assert.equal(r.zortCode, '100');
  assert.equal(r.zortDesc, 'Access Denied.');
  assert.equal(r.unknown, undefined);
});

test('ยิงไม่ถึง · ไม่ใช่ JSON · รูปคำตอบไม่รู้จัก ⇒ unknown และ **ไม่มี count: 0**', async () => {
  withZort();
  reply = () => { throw new Error('timeout'); };
  const a = await zortDocFiles({ doc: 'order', docno: 'SO-1' });
  assert.equal(a.unknown, true);
  reply = () => ({ status: 200, text: '<html>oops</html>' });
  const b = await zortDocFiles({ doc: 'order', docno: 'SO-1' });
  assert.equal(b.unknown, true);
  reply = () => json({ res: { resCode: '200' }, somethingElse: {} });
  const c = await zortDocFiles({ doc: 'order', docno: 'SO-1' });
  assert.equal(c.unknown, true);
  assert.equal(c.count, undefined, 'อ่านรูปคำตอบไม่ออก ห้ามรายงานว่าไม่มีไฟล์');
  assert.deepEqual(c.topKeys, ['res', 'somethingElse']);
});

test('ข้อมูลเข้าผิด ⇒ ตีกลับโดยไม่ยิง ZORT', async () => {
  withZort(); calls = [];
  reply = () => json([]);
  assert.deepEqual((await zortDocFiles({ doc: 'transfer', docno: 'T-1' })).accepts,
    ['order', 'purchaseorder', 'quotation', 'returnorder', 'returnpurchaseorder']);
  assert.match((await zortDocFiles({ doc: 'order' })).error, /docid|docno/);
  /* docid ผิดรูปแต่มี docno มาด้วย ⇒ ต้องตีกลับ ห้ามข้าม id ที่ผิดไปใช้ docno เงียบ ๆ
     (รุ่นแรกตรวจแค่ /docid/ ซึ่งข้อความ "ต้องมี docid หรือ docno" ก็ตรง ⇒ กลายพันธุ์ M5 ไม่แดง) */
  const badId = await zortDocFiles({ doc: 'order', docid: 'SO-1', docno: 'SO-9' });
  assert.match(badId.error, /ตัวเลข/);
  assert.match((await zortDocFiles({ doc: 'order', docid: 1, fileid: 'abc' })).error, /fileid/);
  assert.equal(calls.length, 0);
});

test('ไม่มีรหัส ZORT ⇒ skip ไม่ยิง', async () => {
  noZort(); calls = [];
  const r = await zortDocFiles({ doc: 'order', docno: 'SO-1' });
  assert.ok(r.skip);
  assert.equal(calls.length, 0);
});
