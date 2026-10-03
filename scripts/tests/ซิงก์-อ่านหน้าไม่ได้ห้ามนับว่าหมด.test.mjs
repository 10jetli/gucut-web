// รัน: node --experimental-test-module-mocks --test scripts/tests/ซิงก์-อ่านหน้าไม่ได้ห้ามนับว่าหมด.test.mjs
// B20 — อ่านหน้าไม่ได้ ⇒ ลูปเข้าใจว่า "หมดหน้าแล้ว" ⇒ ของบางส่วนถูกใช้เป็นของครบ
//
// 🔴 ของเดิม: `const d = await r.json().catch(() => ({}))` แล้ว `list = Array.isArray(d.list) ? d.list : []`
//    แล้วปิดลูปด้วย `if (list.length < PAGE) break`
//    ⇒ 200 ที่ JSON เสีย ⇒ `list = []` ⇒ **break ทันทีเหมือนถึงหน้าสุดท้าย**
//    ⇒ `syncOrders` เอากองที่ได้ (ว่าง หรือ บางส่วน) ไปใช้เป็นความจริง
//    ⇒ รายงานซิงก์บอกจำนวนใบ **ลดลงหรือเป็น 0** · ใบใหม่ไม่เคยถึง D1 · ไม่มี error
//
// 🔑 คลาส exhausted-is-not-complete: **"ไล่จนหมด" ไม่เท่ากับ "ครบทั้งชุด"**
//    และที่นี่ตัวชี้ขาด (`list.length`) **พังไปทางเดียวกับปัญหา** ⇒ หน้าตาเหมือนไม่มีปัญหา
//
// 🔑 ต้องตกกับโค้ดเดิม · พิสูจน์แล้ว 4 ต.ค. 2569: โค้ดเดิม ⇒ ตก 3 ข้อ · ตัวแก้ ⇒ ผ่าน 5/5
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

mock.module('@netlify/blobs', {
  namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {}, delete: async () => {} }) },
});

const ร้าน = { tag: 'หลัก', storename: 's', apikey: 'k', apisecret: 'x' };
let หน้าตอบ = [];
let ขอไปกี่หน้า = 0;

globalThis.fetch = async (url) => {
  ขอไปกี่หน้า++;
  const m = /page=(\d+)/.exec(String(url));
  const i = m ? Number(m[1]) - 1 : 0;
  const t = หน้าตอบ[i] ?? { status: 200, json: async () => ({ list: [] }) };
  return { ok: t.status >= 200 && t.status < 300, status: t.status, json: t.json };
};

const { fetchOrders } = await import('../../netlify/lib/core-sync.mjs');

const เต็มหน้า = (n, เริ่ม = 0) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${เริ่ม + i}`, ordernumber: `N${เริ่ม + i}` }));
const PAGE = 200;   // ต้องตรงกับ PAGE ใน core-sync.mjs

const ตั้ง = (...ชุด) => { หน้าตอบ = ชุด; ขอไปกี่หน้า = 0; };

test('B20 · หน้าแรก 200 แต่ JSON เสีย ⇒ ต้องโยน ไม่ใช่คืนกองว่าง', async () => {
  ตั้ง({ status: 200, json: async () => { throw new SyntaxError('bad json'); } });
  await assert.rejects(
    () => fetchOrders(ร้าน, '2026-10-01', '2026-10-03'),
    (e) => /อ่าน|ไม่ได้/.test(String(e.message)),
    'อ่านหน้าไม่ได้ ⇒ ต้องบอกว่าอ่านไม่ได้ ห้ามคืน [] ให้ sync แปลว่า "ไม่มีออเดอร์"',
  );
});

test('B20 · หน้าแรกครบ 200 ใบ แล้วหน้าสองอ่านไม่ได้ ⇒ ต้องโยน ห้ามคืนแค่หน้าแรก', async () => {
  ตั้ง(
    { status: 200, json: async () => ({ list: เต็มหน้า(PAGE) }) },
    { status: 200, json: async () => { throw new SyntaxError('bad json'); } },
  );
  await assert.rejects(() => fetchOrders(ร้าน, '2026-10-01', '2026-10-03'));
});

test('B20 · หน้าที่สองมาเป็น JSON ถูกแต่ไม่มีช่อง list ⇒ ต้องโยน (กลางการไล่หน้า เป็นไปไม่ได้ถ้าปกติ)', async () => {
  ตั้ง(
    { status: 200, json: async () => ({ list: เต็มหน้า(PAGE) }) },
    { status: 200, json: async () => ({ ok: true }) },
  );
  await assert.rejects(() => fetchOrders(ร้าน, '2026-10-01', '2026-10-03'));
});

test('ตัวควบคุมลบ · ไม่มีออเดอร์จริง (หน้าแรก list ว่าง) ⇒ ต้องสำเร็จและได้ 0 ใบ', async () => {
  ตั้ง({ status: 200, json: async () => ({ list: [] }) });
  const out = await fetchOrders(ร้าน, '2026-10-01', '2026-10-03');
  assert.deepEqual(out, [], 'ไม่มีออเดอร์คือคำตอบที่ถูกต้อง ห้ามโยน');
  assert.equal(ขอไปกี่หน้า, 1, 'หน้าแรกไม่เต็ม ⇒ ต้องหยุดไล่หน้า');
});

test('ตัวควบคุมลบ · สองหน้าปกติ ⇒ ได้ครบทั้งสองหน้า', async () => {
  ตั้ง(
    { status: 200, json: async () => ({ list: เต็มหน้า(PAGE) }) },
    { status: 200, json: async () => ({ list: เต็มหน้า(5, PAGE) }) },
  );
  const out = await fetchOrders(ร้าน, '2026-10-01', '2026-10-03');
  assert.equal(out.length, PAGE + 5);
});

// ── B20 ข้อที่สอง (เจอระหว่างแก้ · ไม่ได้อยู่ในใบงาน) ────────────────────────
// ลูปออกได้สองทาง: หน้าไม่เต็ม (หมดจริง) หรือ **ชนเพดาน MAX_PAGES**
// ของเดิมออกทั้งสองทางเงียบ ๆ เหมือนกัน ⇒ ช่วงที่มีออเดอร์เกินเพดานถูกกระจกไม่ครบ
// แล้วรายงานว่าสำเร็จ ⇒ "หยุดเพราะชนเพดานของตัวเอง" ≠ "หยุดเพราะหมด"
const MAX_PAGES = 8;   // ต้องตรงกับ core-sync.mjs

test('B20·2 · ทุกหน้าเต็มจนชนเพดาน ⇒ ต้องโยน ห้ามคืนของไม่ครบว่าสำเร็จ', async () => {
  ตั้ง(...Array.from({ length: MAX_PAGES }, (_, i) => ({
    status: 200, json: async () => ({ list: เต็มหน้า(PAGE, i * PAGE) }),
  })));
  await assert.rejects(
    () => fetchOrders(ร้าน, '2026-01-01', '2026-12-31'),
    (e) => /เพดาน|ไม่ครบ/.test(String(e.message)),
    'ชนเพดานแล้วหน้าสุดท้ายยังเต็ม = ของไม่ครบ ต้องบอก ไม่ใช่คืนเท่าที่ได้',
  );
});

test('ตัวควบคุมลบ · เต็มพอดีถึงหน้าก่อนสุดท้าย แล้วหน้าสุดท้ายไม่เต็ม ⇒ ต้องสำเร็จ', async () => {
  ตั้ง(
    ...Array.from({ length: MAX_PAGES - 1 }, (_, i) => ({
      status: 200, json: async () => ({ list: เต็มหน้า(PAGE, i * PAGE) }),
    })),
    { status: 200, json: async () => ({ list: เต็มหน้า(3, (MAX_PAGES - 1) * PAGE) }) },
  );
  const out = await fetchOrders(ร้าน, '2026-01-01', '2026-12-31');
  assert.equal(out.length, (MAX_PAGES - 1) * PAGE + 3, 'ครบจริงต้องไม่โยน');
});
