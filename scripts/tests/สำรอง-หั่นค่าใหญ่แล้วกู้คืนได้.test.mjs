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
  /* 🔑 สวิตช์ปลูกความล้ม — ใช้โดยข้อ "ล้มทุกถังต้องไม่ตอบว่าสำเร็จ"
     ปฏิเสธเฉพาะ **คำสั่งเขียน** เพื่อให้รูปร่างเหมือนของจริง 4 ต.ค. 2569:
     ตารางสร้างผ่าน แต่ `backupOne` ของแต่ละถังล้ม ⇒ ได้ `error` รายถัง ไม่ใช่โยนทั้งรอบ */
  if (globalThis.__ปลูกล้มเขียน && /^INSERT INTO backups/i.test(sql)) {
    throw new Error('D1 ปลอม (ปลูก): PART_RE is not defined');
  }
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

/* ══════════════════════════════════════════════════════════════════════════
   🔴 **ช่องที่เทสชุดบนมองไม่เห็น — เจอของจริง 4 ต.ค. 2569 หลัง deploy**
   เทสข้างบนยิง `backup-chunks.mjs` **ตรง ๆ** และเขียวครบ 7/7
   แต่ของจริงล้ม **10/10 ถัง** ด้วย `PART_RE is not defined` ·
   `หั่นเก็บ is not defined` — ผม **ลืม import** ของที่เพิ่งสร้างเข้า `backup.mjs`
   🔑 **เทสของโมดูลใหม่ ไม่ใช่เทสของจุดที่เรียกใช้มัน**
      ReferenceError เกิดตอน **บรรทัดนั้นถูกรัน** ⇒ `import()` ผ่าน · `tsc` ไม่เห็น
      (`.mjs` ไม่มีตาข่ายชนิดข้อมูล) · `npm run build` ไม่เห็น ⇒ **ไม่มีด่านไหนจับได้เลย**
   ⇒ ด่านเดียวที่จับได้คือ **เรียกของจริงผ่านจุดใช้งานจริง**
   ══════════════════════════════════════════════════════════════════════════ */
const { runBackup, restore } = await import('../../netlify/lib/backup.mjs');

test('🔑 ต้องเรียกผ่านจุดใช้งานจริง (runBackup) ไม่ใช่เรียกโมดูลหั่นตรง ๆ', async () => {
  blob.clear(); แถว.length = 0;
  blob.set('office/tasks', ใหญ่จริง);
  blob.set('เล็ก/ปกติ', JSON.stringify({ a: 1 }));

  const r = await runBackup();
  const ล้ม = (r.stores ?? []).filter((s) => s.error);
  assert.deepEqual(ล้ม.map((s) => `${s.store}: ${s.error}`), [],
    '🔴 ถังที่ล้ม — ของจริง 4 ต.ค. ล้มทุกถังเพราะชื่อที่ยังไม่ถูก import');
  assert.equal(r.totals.ล้มทั้งหมด, false);

  const ชิ้นในตาราง = แถว.filter((x) => PART_RE.test(x.key));
  assert.ok(ชิ้นในตาราง.length > 1,
    `ค่าใหญ่ต้องลงตารางเป็นหลายชิ้น (เจอ ${ชิ้นในตาราง.length})`);
  const ป้าย = แถว.find((x) => x.key === 'office/tasks');
  assert.ok(ป้าย && ป้าย.body.startsWith('⧉หั่น:'),
    'แถวหลักต้องยังอยู่และถือป้ายจำนวนชิ้น (กลไกเดิมใช้แถวหลักตัดสิน "ไม่เปลี่ยน"/"คีย์หาย")');
  assert.deepEqual(r.totals.skippedKeys, [],
    'ไม่ควรมีคีย์ไหนถูกข้ามแล้ว — นั่นคือเหตุผลของใบนี้');
});

test('🔑 กู้คืนผ่านจุดใช้งานจริง (restore โหมดซ้อม) ต้องต่อชิ้นได้ครบ', async () => {
  const r = await restore({ store: 'gucut-coupon', key: 'office/tasks', confirm: false });
  assert.deepEqual(r['ต่อชิ้นไม่ได้'] ?? [], [],
    '🔑 "เก็บลงได้" ยังไม่ใช่ "กู้คืนได้" — ช่องนี้ต้องมีทุกครั้งแม้ว่าง');
  const ได้ = (r.rows ?? r.preview ?? []).find?.((x) => x.key === 'office/tasks');
  if (ได้) assert.equal(ได้.body, ใหญ่จริง, 'ค่าที่กู้ได้ต้องเท่าเดิมทุกไบต์');
});

test('🔴 ล้มทุกถัง ต้องไม่ตอบว่าสำเร็จ (ของจริง 4 ต.ค. ตอบ ok:true ทั้งที่ล้ม 10/10)', async () => {
  blob.clear(); แถว.length = 0;
  blob.set('office/tasks', ใหญ่จริง);
  globalThis.__ปลูกล้มเขียน = true;
  let r;
  try { r = await runBackup(); } finally { globalThis.__ปลูกล้มเขียน = false; }

  /* ① ปลูกต้องติดจริง — ไม่งั้นข้อนี้เขียวโดยไม่ได้วัดอะไร (เขียวลวงรุ่นแรกของข้อนี้) */
  const ล้ม = (r.stores ?? []).filter((s) => s.error);
  assert.ok(ล้ม.length > 0, '🔴 ปลูกไม่ติด — ไม่มีถังไหนล้มเลย ข้อนี้จึงวัดอะไรไม่ได้');
  assert.equal(ล้ม.length, (r.stores ?? []).length, 'ปลูกแล้วต้องล้มทุกถัง');

  /* ② ฟิลด์ที่ผู้เรียกใช้ตัดสินใจต้องบอกความจริง */
  assert.equal(r.totals.ล้มทั้งหมด, true,
    '🔑 ผู้เรียก (`core.mjs ?backup=1`) อ่านฟิลด์นี้ตัดสินว่าจะตอบ 503 — ผิดที่นี่ = หน้าสถานะขึ้นเขียวในคืนที่ไม่มีสำเนาเกิดขึ้นเลย');
  assert.ok(r.totals.failedStores.length > 0, 'ต้องบอกชื่อถังที่ล้มด้วย ไม่ใช่แค่จำนวน');
  assert.match(r.totals.failedStores[0], /PART_RE is not defined/,
    'เหตุของแต่ละถังต้องถึงผู้อ่าน — 4 ต.ค. ทั้ง 10 ถังล้มด้วยเหตุเดียวกัน ซึ่งมองออกได้จากเหตุ ไม่ใช่จากจำนวน');
});

test('🔬 ตัวควบคุมลบของข้อบน: ไม่ปลูก ⇒ ล้มทั้งหมดต้องเป็น false', async () => {
  blob.clear(); แถว.length = 0;
  blob.set('office/tasks', ใหญ่จริง);
  const r = await runBackup();
  assert.equal(r.totals.ล้มทั้งหมด, false, 'ปกติต้องไม่ติดธงล้ม');
  assert.deepEqual(r.totals.failedStores, [], 'ปกติต้องไม่มีถังล้ม');
  /* ⇒ สองข้อคู่กันพิสูจน์ว่าฟิลด์นี้ **แยกแยะได้** ไม่ใช่ค่าคงที่ */
});
