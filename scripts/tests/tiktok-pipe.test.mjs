// รัน: node --experimental-test-module-mocks --test scripts/tests/tiktok-pipe.test.mjs
// ท่อกระจายคลิป ขา TikTok — กล่องฝากของสองทางระหว่างจอกับ g1 (`/api/tiktok-pipe`)
//
// 🔴 เคสที่สำคัญที่สุดในไฟล์นี้ไม่ใช่ "ทางที่สำเร็จ" แต่เป็นสามเคสที่เคยกัดทีมมาแล้ว:
//    ① อ่านคลังไม่ได้ ต้องไม่กลายเป็น "ยังไม่เคยส่งคลิป"  (ไม่รู้ ≠ ไม่มี)
//    ② ก้อนผิดรูป ต้องไม่ทับของเดิมที่ยังดี               (ตัวแก้ที่ทำลายของถูก)
//    ③ กดปุ่มซ้ำ ต้องไม่รีเซ็ตอายุคำขอ · เคลียร์ธงต้องใช้โทเคน (ไม่กินคำขอใบใหม่)
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const data = new Map();
const state = { failGet: null, failSet: false, failDelete: false, ok: true };
const fakeStore = {
  get: async (key) => {
    if (state.failGet && String(key).startsWith(state.failGet)) throw new Error('blobs อ่านล้มจำลอง');
    return data.has(key) ? structuredClone(data.get(key)) : null;
  },
  setJSON: async (key, value) => {
    if (state.failSet) throw new Error('blobs เขียนล้มจำลอง');
    data.set(key, structuredClone(value));
  },
  delete: async (key) => {
    if (state.failDelete) throw new Error('blobs ลบล้มจำลอง');
    data.delete(key);
  },
};

mock.module('@netlify/blobs', { namedExports: { getStore: () => fakeStore } });
mock.module('../../netlify/lib/admin-gate.mjs', {
  namedExports: { adminGate: async () => (state.ok ? { ok: true } : { ok: false }) },
});

const { default: api } = await import('../../netlify/functions/tiktok-pipe.mjs');

const reset = () => {
  data.clear();
  state.failGet = null; state.failSet = false; state.failDelete = false; state.ok = true;
};
const req = (method, url, body) => new Request(url, {
  method,
  headers: { 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const ยิง = async (method, url, body) => {
  const r = await api(req(method, url, body), {});
  return { status: r.status, body: await r.json(), แคช: r.headers.get('cache-control') };
};

const ใบดี = (n = 1) => ({
  เมื่อ: '2026-10-24T11:50:00.000Z',
  บัญชี: 'ajtcut_8',
  โหมด: 'อัปจริง',
  เพดานต่อรอบ: 5,
  รายการ: Array.from({ length: n }, (_, i) => ({
    fbid: `99000543745057${i}`,
    ชื่อ: 'อ.ธง · 17 ต.ค. 2569',
    publish_id: `v_inbox_file~v2.77000732678893097${i}`,
    สถานะตอนส่ง: 'PROCESSING_UPLOAD',
    สถานะล่าสุด: 'SEND_TO_USER_INBOX',
    ถามเมื่อ: '2026-10-24T11:50:00.000Z',
    ทาง: 'กล่องร่าง',
    ลิงก์fb: '/reel/990005437450571/',
  })),
});

test('ไม่มีรหัสหลังร้าน = 401 ทุก method (ข้อมูลหลังบ้าน ไม่ใช่ของสาธารณะ)', async () => {
  reset(); state.ok = false;
  for (const [m, b] of [['GET', null], ['POST', { ขอรอบ: 1 }]]) {
    const r = await ยิง(m, 'https://x/api/tiktok-pipe', b);
    assert.equal(r.status, 401, `${m} ต้องเป็น 401`);
  }
});

test('① อ่านคลังไม่ได้ ⇒ 503 + บอกเหตุ — ห้ามกลายเป็นรายการว่าง', async () => {
  reset();
  data.set('tiktok-pipe/รายการ', ใบดี(2));
  state.failGet = 'tiktok-pipe';
  const r = await ยิง('GET', 'https://x/api/tiktok-pipe');
  assert.equal(r.status, 503);
  assert.equal(r.body['สถานะข้อมูล'], 'อ่านคลังไม่ได้');
  // 🔴 ตัวควบคุมของเคสนี้: ต้อง **ไม่มี** รายการว่างแนบมาให้จอเข้าใจผิด
  assert.equal(r.body['รายการ'], undefined);
});

test('① อ่านธงไม่ได้ (?ธง=1) ⇒ 503 — ห้ามตอบ "ไม่มีธง" ให้ g1 ข้ามคำขอไปเงียบ ๆ', async () => {
  reset();
  data.set('tiktok-pipe/ขอรอบ', { ขอเมื่อ: '2026-10-24T11:00:00.000Z' });
  state.failGet = 'tiktok-pipe/ขอรอบ';
  const r = await ยิง('GET', 'https://x/api/tiktok-pipe?ธง=1');
  assert.equal(r.status, 503);
  assert.equal(r.body['ขอรอบ'], undefined);
});

test('ยังไม่เคยมีใครดัน ⇒ 200 + สถานะข้อมูลบอกตรง ๆ (ต่างจาก "ส่งแล้ว 0 ใบ")', async () => {
  reset();
  const ว่าง = await ยิง('GET', 'https://x/api/tiktok-pipe');
  assert.equal(ว่าง.status, 200);
  assert.equal(ว่าง.body['สถานะข้อมูล'], 'ยังไม่เคยมีใครดัน');
  assert.match(ว่าง.body['เหตุ'], /ยังไม่เคยดัน/);

  // ⇒ ดันก้อนที่ไม่มีคลิปสักใบ: **คนละสถานะ** กับข้างบน
  await ยิง('POST', 'https://x/api/tiktok-pipe', { ดัน: { ...ใบดี(0) } });
  const ศูนย์ใบ = await ยิง('GET', 'https://x/api/tiktok-pipe');
  assert.equal(ศูนย์ใบ.body['สถานะข้อมูล'], 'มีข้อมูล');
  assert.deepEqual(ศูนย์ใบ.body['รายการ'], []);
});

test('ดันแล้วอ่านกลับได้ · สองช่องสถานะแยกกัน · ไม่แคช', async () => {
  reset();
  const ดัน = await ยิง('POST', 'https://x/api/tiktok-pipe', { ดัน: ใบดี(2) });
  assert.equal(ดัน.status, 200);
  assert.equal(ดัน.body['รับไว้'], 2);
  assert.ok(ดัน.body['ดันเมื่อ'], 'ต้องคืนเวลาของเซิร์ฟเวอร์กลับมา');

  const r = await ยิง('GET', 'https://x/api/tiktok-pipe');
  assert.equal(r.body['บัญชี'], 'ajtcut_8');
  assert.equal(r.body['รายการ'].length, 2);
  // 🔑 สองช่องนี้ยุบรวมกันไม่ได้ — ค่าที่จดไว้ตอนส่งเก่ากว่าค่าที่ถามสด
  assert.equal(r.body['รายการ'][0]['สถานะตอนส่ง'], 'PROCESSING_UPLOAD');
  assert.equal(r.body['รายการ'][0]['สถานะล่าสุด'], 'SEND_TO_USER_INBOX');
  assert.ok(r.body['เมื่อ'] && r.body['ดันเมื่อ'], 'เก็บทั้งนาฬิกา g1 และนาฬิกาเซิร์ฟเวอร์');
  assert.match(r.แคช, /no-store/);
});

test('ถามสถานะสดไม่ได้ ⇒ สถานะล่าสุด null + เหตุ — ห้ามเอาค่าตอนส่งมาสวมเป็นของสด', async () => {
  reset();
  const ใบ = ใบดี(1);
  ใบ.รายการ[0]['สถานะล่าสุด'] = null;
  ใบ.รายการ[0]['เหตุถามไม่ได้'] = 'โทเคนหมดอายุ';
  ใบ.รายการ[0]['ถามเมื่อ'] = null;
  await ยิง('POST', 'https://x/api/tiktok-pipe', { ดัน: ใบ });
  const r = await ยิง('GET', 'https://x/api/tiktok-pipe');
  assert.equal(r.body['รายการ'][0]['สถานะล่าสุด'], null);
  assert.equal(r.body['รายการ'][0]['เหตุถามไม่ได้'], 'โทเคนหมดอายุ');
  assert.equal(r.body['รายการ'][0]['สถานะตอนส่ง'], 'PROCESSING_UPLOAD');
});

test('② ก้อนผิดรูป ⇒ 400 และของเดิมต้องอยู่ครบ (ตัวแก้ที่ทำลายของถูก)', async () => {
  reset();
  await ยิง('POST', 'https://x/api/tiktok-pipe', { ดัน: ใบดี(3) });
  const ก่อน = structuredClone(data.get('tiktok-pipe/รายการ'));

  const เสีย = [
    [{ เมื่อ: '2026-10-24T11:50:00.000Z' }, /รายการ/],                       // ไม่มีอาเรย์
    [{ รายการ: [] }, /เมื่อ/],                                                // ไม่มีเวลา
    [{ เมื่อ: 'เมื่อกี้นี้', รายการ: [] }, /เมื่อ/],                            // เวลาอ่านไม่ออก
    [{ เมื่อ: '2026-10-24T11:50:00.000Z', รายการ: [{ fbid: '1' }] }, /publish_id/], // ใบขาดช่อง
  ];
  for (const [ก้อน, รูป] of เสีย) {
    const r = await ยิง('POST', 'https://x/api/tiktok-pipe', { ดัน: ก้อน });
    assert.equal(r.status, 400, `ก้อน ${JSON.stringify(ก้อน).slice(0, 40)} ต้องถูกตีกลับ`);
    assert.match(r.body.error, รูป);
    assert.match(r.body.error, /ไม่เขียนทับของเดิม/);
  }
  assert.deepEqual(data.get('tiktok-pipe/รายการ'), ก่อน, 'ของเดิมต้องไม่ถูกแตะสักไบต์');
});

test('③ กดปุ่มซ้ำ ⇒ ไม่รีเซ็ตอายุคำขอ (ไม่งั้น "ค้างนานแล้ว" จะไม่มีวันโผล่)', async () => {
  reset();
  const ครั้งแรก = await ยิง('POST', 'https://x/api/tiktok-pipe', { ขอรอบ: 1 });
  assert.equal(ครั้งแรก.body['ซ้ำ'], false);
  const ขอเมื่อ = ครั้งแรก.body['ขอเมื่อ'];

  const ครั้งสอง = await ยิง('POST', 'https://x/api/tiktok-pipe', { ขอรอบ: 1 });
  assert.equal(ครั้งสอง.body['ซ้ำ'], true);
  assert.equal(ครั้งสอง.body['ขอเมื่อ'], ขอเมื่อ, 'เวลาเดิมต้องคงอยู่');

  // จอต้องเห็นว่ามีคำขอค้าง · g1 ต้องเห็นเหมือนกัน
  assert.equal((await ยิง('GET', 'https://x/api/tiktok-pipe')).body['ขอรอบค้าง'], ขอเมื่อ);
  assert.deepEqual((await ยิง('GET', 'https://x/api/tiktok-pipe?ธง=1')).body['ขอรอบ'], { ขอเมื่อ });
});

test('③ เคลียร์ธงต้องใช้โทเคน — โทเคนไม่ตรงห้ามลบ (กันกินคำขอใบใหม่)', async () => {
  reset();
  const เก่า = (await ยิง('POST', 'https://x/api/tiktok-pipe', { ขอรอบ: 1 })).body['ขอเมื่อ'];

  const ผิด = await ยิง('POST', 'https://x/api/tiktok-pipe', { รับธง: '2020-01-01T00:00:00.000Z' });
  assert.equal(ผิด.body['ผล'], 'ธงเปลี่ยนแล้ว ไม่ลบ');
  assert.ok(data.has('tiktok-pipe/ขอรอบ'), 'ธงต้องยังอยู่');

  const ถูก = await ยิง('POST', 'https://x/api/tiktok-pipe', { รับธง: เก่า });
  assert.equal(ถูก.body['ผล'], 'ลบแล้ว');
  assert.equal(data.has('tiktok-pipe/ขอรอบ'), false);

  assert.equal((await ยิง('POST', 'https://x/api/tiktok-pipe', { รับธง: เก่า })).body['ผล'], 'ไม่มีธง');
});

test('เขียน/ลบคลังล้ม ⇒ 503 ห้ามตอบ ok · คำสั่งที่ไม่รู้จัก ⇒ 400 · method อื่น ⇒ 405', async () => {
  reset();
  state.failSet = true;
  assert.equal((await ยิง('POST', 'https://x/api/tiktok-pipe', { ดัน: ใบดี(1) })).status, 503);
  assert.equal((await ยิง('POST', 'https://x/api/tiktok-pipe', { ขอรอบ: 1 })).status, 503);

  reset();
  await ยิง('POST', 'https://x/api/tiktok-pipe', { ขอรอบ: 1 });
  state.failDelete = true;
  const โทเคน = data.get('tiktok-pipe/ขอรอบ')['ขอเมื่อ'];
  assert.equal((await ยิง('POST', 'https://x/api/tiktok-pipe', { รับธง: โทเคน })).status, 503);

  reset();
  assert.equal((await ยิง('POST', 'https://x/api/tiktok-pipe', { อะไรไม่รู้: 1 })).status, 400);
  assert.equal((await ยิง('DELETE', 'https://x/api/tiktok-pipe')).status, 405);
});

test('เพดานต่อรอบมาจาก g1 เท่านั้น — ค่าที่อ่านไม่ได้ ⇒ null ห้ามใส่ค่าเริ่มต้นแทน', async () => {
  reset();
  await ยิง('POST', 'https://x/api/tiktok-pipe', { ดัน: ใบดี(1) });
  assert.equal((await ยิง('GET', 'https://x/api/tiktok-pipe')).body['เพดานต่อรอบ'], 5);

  /* 🔴 จอห้ามพิมพ์เลขนี้ไว้เอง (ด่าน "เลขค้างบนจอ" ของฝั่งจอจับคลาสนี้)
     ⇒ ท่ออ่านค่าไม่ได้ต้องตอบ null เพื่อให้จอ **ไม่โชว์บรรทัดนั้น**
        ใส่ค่าเริ่มต้นแทน = จอโชว์เลขที่ไม่มีใครวัด ซึ่งแย่กว่าไม่โชว์ */
  for (const เสีย of [undefined, null, 0, -3, 'ห้าใบ', {}]) {
    reset();
    const ใบ = { ...ใบดี(1), เพดานต่อรอบ: เสีย };
    const r = await ยิง('POST', 'https://x/api/tiktok-pipe', { ดัน: ใบ });
    assert.equal(r.status, 200, `เพดาน ${JSON.stringify(เสีย)} ต้องไม่ทำให้ก้อนถูกตีกลับ`);
    assert.equal((await ยิง('GET', 'https://x/api/tiktok-pipe')).body['เพดานต่อรอบ'], null,
      `เพดาน ${JSON.stringify(เสีย)} ต้องกลายเป็น null`);
  }
});
