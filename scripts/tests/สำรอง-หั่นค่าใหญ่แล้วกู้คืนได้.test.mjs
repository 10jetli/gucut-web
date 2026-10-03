// รัน: node --experimental-test-module-mocks --test scripts/tests/สำรอง-หั่นค่าใหญ่แล้วกู้คืนได้.test.mjs
// ใบ t_musq1h42 — ค่าที่ใหญ่เกินเพดานคำสั่ง D1 ต้องถูก **หั่นเก็บและกู้คืนได้** ไม่ใช่ข้าม
//
// 🔴 ที่มา 4 ต.ค. 2569: `backup-run` ขึ้น failed 4/4 เพราะข้ามคีย์ใหญ่ 3 คีย์
//    และหนึ่งในนั้นคือ `gucut-coupon/office/tasks` (303,262 B) = **กระดานงานทีมทั้งใบ**
//    ⇒ สร้างใหม่ไม่ได้ ⇒ ถังหาย = หายถาวร
//    เหตุ: D1 จำกัด **ความยาวคำสั่ง** ~100 KB ⇒ แถวเดียวเก็บไม่ได้จริง
//
// 🔑 **เกณฑ์ของใบนี้ไม่ใช่ "เก็บลงได้" แต่คือ "กู้กลับมาได้เหมือนเดิมทุกไบต์"**
//    ของที่เก็บลงแล้วกู้ไม่ได้ = ไม่มีสำเนา · และจะรู้ตอนที่ต้องใช้จริงซึ่งสายไปแล้ว
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// ── D1 ปลอม: เก็บแถวในหน่วยความจำ + **บังคับเพดานความยาวคำสั่งเหมือนของจริง** ──
const แถว = [];           // {store,key,body,bytes,at,gone_at,etag}
const คำสั่งที่ยิง = [];
const D1_เพดาน = 100_000; // ของจริง: SQLITE_TOOBIG ที่ ~100 KB

function d1(sql) {
  คำสั่งที่ยิง.push(sql);
  /* 🔑 **ตัว D1 ปลอมต้องล้มเหมือนของจริงเมื่อคำสั่งยาวเกิน**
     ไม่งั้นเทสจะผ่านทั้งที่ของจริงจะล้ม — ตัวปลอมที่ไม่มีข้อจำกัดของจริง
     ทดสอบได้แค่ว่าโค้ดเรา "ทำงานจบ" ไม่ได้ทดสอบว่ามันทำงานได้ที่ปลายทาง */
  if (Buffer.byteLength(sql, 'utf8') > D1_เพดาน) {
    throw new Error('D1 400: [{"code":7500,"message":"statement too long: SQLITE_TOOBIG"}]');
  }
  const ins = /^INSERT INTO backups[\s\S]*?VALUES\s*([\s\S]*)$/i.exec(sql);
  if (ins) {
    for (const m of ins[1].matchAll(/\('([^']*(?:''[^']*)*)','([^']*(?:''[^']*)*)','([^']*(?:''[^']*)*)',(\d+)/g)) {
      const un = (v) => v.replace(/''/g, "'");
      const [, st, k, b, by] = m;
      const i = แถว.findIndex((r) => r.store === un(st) && r.key === un(k));
      const row = { store: un(st), key: un(k), body: un(b), bytes: Number(by), at: 'now', gone_at: null, etag: null };
      if (i >= 0) แถว[i] = row; else แถว.push(row);
    }
    return [];
  }
  const sel = /SELECT key, body, bytes, at, gone_at FROM backups WHERE store = '([^']*)'(?:\s+AND key = '([^']*)')?/.exec(sql);
  if (sel) {
    return แถว.filter((r) => r.store === sel[1] && (!sel[2] || r.key === sel[2]))
      .map((r) => ({ key: r.key, body: r.body, bytes: r.bytes, at: r.at, gone_at: r.gone_at }));
  }
  return [];
}

mock.module('../../netlify/lib/coredb.mjs', {
  namedExports: { coreQuery: async (sql) => d1(sql), coreReady: () => true },
});

// ── Blobs ปลอม ──
const blob = new Map();
mock.module('@netlify/blobs', {
  namedExports: {
    getStore: () => ({
      list: async () => ({ blobs: [...blob.keys()].map((key) => ({ key })) }),
      get: async (k) => blob.get(k) ?? null,
      set: async (k, v) => { blob.set(k, v); },
      setJSON: async (k, v) => { blob.set(k, JSON.stringify(v)); },
      delete: async (k) => { blob.delete(k); },
    }),
  },
});

const { หั่นเก็บ, ต่อกลับ, PART_RE } = await import('../../netlify/lib/backup-chunks.mjs');

// ค่าทดสอบ: ภาษาไทยเป็นหลัก (3 ไบต์/ตัว) ขนาดใกล้ของจริง 303 KB
const ใหญ่จริง = JSON.stringify(
  Array.from({ length: 900 }, (_, i) => ({
    id: `t_ทดสอบ${i}`, text: `ใบงานทดสอบหมายเลข ${i} — ข้อความยาวพอให้ก้อนรวมใหญ่เกินเพดาน D1 จริง ๆ`,
    note: 'รายละเอียดเพิ่มเติมที่ทำให้แต่ละใบใหญ่ขึ้น '.repeat(3), owner: 'gucut', at: 1759500000000 + i,
  })),
);

test('ขนาดค่าทดสอบต้องเกินเพดานจริง — ไม่งั้นเทสนี้ไม่ได้ทดสอบอะไร', () => {
  const ไบต์ = Buffer.byteLength(ใหญ่จริง, 'utf8');
  assert.ok(ไบต์ > 150_000, `ค่าทดสอบต้องใหญ่กว่า 150 KB แต่ได้ ${ไบต์} B`);
});

test('🔑 เกณฑ์ของใบ: หั่นเก็บแล้ว **ต่อกลับได้เหมือนเดิมทุกไบต์**', () => {
  const ชิ้น = หั่นเก็บ(ใหญ่จริง, 'office/tasks');
  assert.ok(ชิ้น.length > 1, 'ค่าใหญ่ต้องถูกหั่นหลายชิ้น');
  const กลับ = ต่อกลับ(ชิ้น.map((c) => c.body));
  assert.equal(กลับ, ใหญ่จริง, 'ต่อกลับต้องได้ค่าเดิมเป๊ะ');
});

test('ทุกชิ้นต้องเล็กพอให้แถว SQL ไม่เกินเพดาน D1', () => {
  const ชิ้น = หั่นเก็บ(ใหญ่จริง, 'office/tasks');
  for (const c of ชิ้น) {
    const แถวSQL = `('gucut-coupon','${c.key}','${c.body.replace(/'/g, "''")}',${c.body.length},datetime('now'),NULL,NULL)`;
    assert.ok(Buffer.byteLength(แถวSQL, 'utf8') < 80_000,
      `ชิ้น ${c.key} ทำให้แถว SQL ยาว ${Buffer.byteLength(แถวSQL, 'utf8')} B`);
  }
});

test('ชื่อคีย์ของชิ้นต้องแยกออกจากคีย์จริงได้ และบอกลำดับ/จำนวนครบ', () => {
  const ชิ้น = หั่นเก็บ(ใหญ่จริง, 'office/tasks');
  for (const [i, c] of ชิ้น.entries()) {
    const m = PART_RE.exec(c.key);
    assert.ok(m, `คีย์ชิ้น ${c.key} ต้องเข้ารูปที่ตัวกู้คืนรู้จัก`);
    assert.equal(m[1], 'office/tasks');
    assert.equal(Number(m[2]), i);
    assert.equal(Number(m[3]), ชิ้น.length);
  }
  assert.ok(!PART_RE.test('office/tasks'), 'คีย์จริงต้องไม่ถูกอ่านว่าเป็นชิ้น');
});

test('🔴 ชิ้นขาด ⇒ ต้องปฏิเสธ ห้ามต่อกลับครึ่ง ๆ', () => {
  const ชิ้น = หั่นเก็บ(ใหญ่จริง, 'office/tasks');
  const ขาด = ชิ้น.slice(0, -1).map((c) => c.body);
  assert.throws(() => ต่อกลับ(ขาด, ชิ้น.length),
    /ชิ้นไม่ครบ/, 'ของครึ่งใบที่ดูเหมือนกู้สำเร็จ แย่กว่ากู้ไม่ได้');
});

test('ตัวควบคุมลบ · ค่าเล็ก ⇒ ไม่ต้องหั่น (คืนชิ้นเดียวหรือไม่หั่น)', () => {
  const เล็ก = JSON.stringify({ a: 'ของเล็ก' });
  const ชิ้น = หั่นเก็บ(เล็ก, 'เล็ก');
  assert.equal(ชิ้น.length, 1, 'ค่าเล็กไม่ควรถูกหั่นเป็นหลายชิ้น');
  assert.equal(ต่อกลับ(ชิ้น.map((c) => c.body)), เล็ก);
});

test('ตัวควบคุมลบ · ค่าที่มี quote และอักขระพิเศษ ต้องรอดการ escape', () => {
  const มีquote = JSON.stringify({ s: `ของที่มี ' และ '' และ \\ และ ⧉ และ \n ปนอยู่` });
  assert.equal(ต่อกลับ(หั่นเก็บ(มีquote, 'q').map((c) => c.body)), มีquote);
});
