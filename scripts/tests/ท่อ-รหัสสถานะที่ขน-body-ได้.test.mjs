// รัน: node --experimental-test-module-mocks --test scripts/tests/ท่อ-รหัสสถานะที่ขน-body-ได้.test.mjs
// ใบ t_mu1bkrdw (สัญญากับฝั่งจอ) — "unknown" ต้องใช้รหัสที่ **ขน body ได้**
//
// 🔴 ของเดิม: `?zortlist=` คืน `502` สำหรับ unknown พร้อม `zortCode`/`zortDesc`/`error` ครบ
//    **แต่จอไม่เคยได้เห็น body** — Cloudflare แทน body ของ 502 ด้วยหน้าของตัวเอง
//    📏 วัดของจริง 4 ต.ค. 2569 ด้วย `?probestatus=<รหัส>`:
//       424 · 409 · 422 · **503** ⇒ body ครบ `application/json` มี `x-nf-request-id`
//       **502 ⇒ 16 ไบต์ `text/plain` ไม่มี `x-nf-request-id`** ⇒ CDN ตอบเอง
//    🔑 **ไม่ใช่ "5xx ถูกกิน" — เป็น 502 เท่านั้น** (503 รอด)
//       ⇒ ผมเคยเขียนสรุปกว้างเกินจากตัวอย่างเดียว · คลาสเดียวกับที่ฝั่งจอเตือนเรื่อง 4xx
//
// 🔑 เทสนี้ **ตรึงรหัสที่เลือกไว้** เพื่อให้คนที่เปลี่ยนกลับเป็น 5xx ต้องเจอด่านก่อน
//    (เหตุผลที่ไม่ควรเปลี่ยนอยู่ในคอมเมนต์ของ core.mjs และวัดซ้ำได้ด้วย ?probestatus=)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const src = readFileSync('netlify/functions/core.mjs', 'utf8');

test('🔒 unknown ของ zortlist ต้องไม่ใช้ 502 (CDN กิน body ของรหัสนี้)', () => {
  const m = /return json\(r, r\.ok \|\| r\.skip \? 200 : r\.unknown \? (\d{3}) : 400\);/.exec(src);
  assert.ok(m, 'ไม่เจอบรรทัดที่แปลงผลเป็นรหัสสถานะของ zortlist');
  const รหัส = Number(m[1]);
  assert.notEqual(รหัส, 502,
    '🔴 502 ทำให้ body (zortCode/zortDesc/error) หายทั้งก้อน — วัดแล้ว 4 ต.ค. 2569');
  /* 🔑 **ห้ามเขียนด่านเป็น "ต้องอยู่ในช่วง 4xx"** — รุ่นแรกผมเขียนแบบนั้น
     แล้วฝั่งจอวัดต่อครบ 8 รหัสพบว่า `500` และ `503` **รอดทั้งคู่**
     ⇒ เกณฑ์ที่อิง "ชั้นของรหัส" **ผิดตั้งแต่สมมติฐาน** · ของที่วัดได้คือ **502 ตัวเดียวที่ถูกกิน**
     ⇒ ด่านจึงตรึง "ห้าม 502" + "ต้องเป็นรหัสที่วัดแล้วว่ารอด" ไม่ใช่ช่วงของรหัส */
  const วัดแล้วว่ารอด = [200, 400, 409, 422, 424, 429, 500, 503];
  assert.ok(วัดแล้วว่ารอด.includes(รหัส),
    `ต้องเป็นรหัสที่ยิงวัดแล้วว่า body รอด (${วัดแล้วว่ารอด.join(" · ")}) — ได้ ${รหัส}`);
  assert.equal(รหัส, 503,
    'ตกลงกับฝั่งจอ 4 ต.ค. 2569: 503 Service Unavailable (body รอด + ความหมายตรง + repo ใช้อยู่แล้ว)');
});

test('🔒 ต้องมีเส้นวัด ?probestatus= ไว้วัดซ้ำเมื่อ CDN เปลี่ยนพฤติกรรม', () => {
  assert.match(src, /probestatus/,
    'คำเตือนเรื่อง CDN ต้อง **วัดซ้ำได้** ไม่ใช่ค้างอยู่ในคอมเมนต์');
});

test('🔑 ฟิลด์ที่เครื่องอ่านได้ต้องมีทุกกรณี — ไม่มีช่อง ≠ ไม่มีปัญหา', async () => {
  const fin = readFileSync('netlify/lib/zort-finance.mjs', 'utf8');
  /* ทั้งสามทางออกของ `zortReadList` ต้องมี `upstream` ⇒ จอแยก
     "ท่อรุ่นเก่าไม่ส่งมา" ออกจาก "ไม่มีปัญหา" ได้ */
  const จำนวน = (fin.match(/upstream: "zort"/g) || []).length;
  assert.ok(จำนวน >= 3,
    `ทางออกของ zortReadList ต้องติด upstream ทุกทาง (เจอ ${จำนวน} ที่ · ต้อง ≥3: ยิงไม่ถึง · ไม่คืนรายการ · สำเร็จ)`);
  assert.match(fin, /upstreamOk: true/, 'กรณีสำเร็จต้องบอกตรง ๆ ว่าปลายทางปกติ');
  assert.match(fin, /retryable: true/, 'กรณี unknown ต้องบอกว่าลองใหม่ได้');
});

test('🔬 พลังแยกแยะ: ถ้ามีคนเปลี่ยนกลับเป็น 502 ด่านข้อแรกต้องแดง', () => {
  const ปลูก = 'return json(r, r.ok || r.skip ? 200 : r.unknown ? 502 : 400);';
  const m = /r\.unknown \? (\d{3})/.exec(ปลูก);
  assert.equal(Number(m[1]), 502, 'ตัวจับคู่ต้องอ่านรหัสจากบรรทัดได้จริง');
  /* ⇒ ด่านข้อแรกใช้ตัวจับคู่เดียวกัน ⇒ ถ้าโค้ดกลับไป 502 มันจะแดง (ไม่ใช่เงียบ) */
});
