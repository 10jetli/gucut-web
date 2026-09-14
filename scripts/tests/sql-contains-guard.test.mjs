// รัน: node --test scripts/tests/sql-contains-guard.test.mjs
// 15 ก.ย. 2569 — ตัวเฝ้าคลาส "LIKE '%คำค้น%' ชนเพดาน 50 ไบต์ของ D1" (ดู netlify/lib/sql-contains.mjs)
// 🔴 ของจริงที่เจอ: ชื่อไทย ≥17 ตัว ⇒ ผู้ติดต่อ · ขาย · สต็อก ตอบ HTTP 500 ทุกจอ มาตั้งแต่มีช่องค้นหา
//    ไม่มีเทสต์ไหนเห็น เพราะป้อนคำค้นสั้นเสมอ และฐานปลอมไม่มีเพดาน ⇒ เฝ้าที่ซอร์สแทน
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOTS = ['netlify/lib', 'netlify/functions'];
/* ค่าคงที่ที่เราเขียนเอง ไม่ใช่คำที่คนพิมพ์ — สั้นและรู้ความยาวแน่นอน
   ⚠️ เพิ่มรายการตรงนี้ได้เฉพาะค่าที่ไม่มีทางมาจากผู้ใช้ และต้องเขียนเหตุผลกำกับ */
const ALLOW = [
  // zortChannelsOn(day, likeWord) — likeWord มาจากโค้ด ("Shopee") ไม่ใช่ช่องค้นหา
  { file: 'netlify/lib/shopee-orders.mjs', snippet: '`%${likeWord}%`' },
];

function files() {
  return ROOTS.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.mjs')).map((f) => join(d, f)));
}

test('ห้ามห่อค่าจากตัวแปรด้วย %…% ในโค้ดเซิร์ฟเวอร์ (รูปแบบ LIKE ที่ยาวตามคนพิมพ์)', () => {
  const bad = [];
  for (const f of files()) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return; // บรรทัดคอมเมนต์
      for (const m of line.matchAll(/%\$\{[^}]+\}%/g)) {
        const around = line.slice(Math.max(0, m.index - 1), m.index + m[0].length + 1);
        if (ALLOW.some((a) => a.file === f && around.includes(a.snippet.slice(1, -1)))) continue;
        bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(bad, [], 'ใช้ contains()/containsLit() จาก sql-contains.mjs แทน:\n' + bad.join('\n'));
});

test('ห้าม LIKE ต่อด้วยค่าที่ฝังจากตัวแปร — ทางอ้อมของคลาสเดียวกัน', () => {
  const bad = [];
  for (const f of files()) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/LIKE\s+\$\{/.test(line)) bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('ตัวช่วยสร้าง instr ถูกรูป — ไม่มี LIKE ไม่ห่อ %', async () => {
  const { contains, containsLit } = await import('../../netlify/lib/sql-contains.mjs');
  assert.equal(contains('name'), 'instr(lower(name), lower(?)) > 0');
  assert.equal(containsLit('p.name', "'ก''ข'"), "instr(lower(p.name), lower('ก''ข')) > 0");
});
