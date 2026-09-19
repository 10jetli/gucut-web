// รัน: node --test scripts/tests/stock-push-sweep-schedules.test.mjs
// 17 ก.ย. 2569 · gucut2 — ตัวกวาดตามเวลาของ Shopee/TikTok
// 🔴 สิ่งที่เฝ้า: แต่ละไฟล์กวาดเจ้าของตัวเองเท่านั้น · นาทีไม่ชนกันทั้งสามเจ้า (push_sweep_log.at เป็นกุญแจ + งบเวลา)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const อ่าน = (f) => readFileSync(new URL(`../../netlify/functions/${f}`, import.meta.url), 'utf8');
const นาที = (cron) => {
  const m = cron.split(' ')[0];
  if (m.startsWith('*/')) { const n = Number(m.slice(2)); return Array.from({ length: 60 / n }, (_, i) => i * n); }
  return m.split(',').map(Number);
};

test('แต่ละไฟล์กวาดเจ้าของตัวเอง และนาทีไม่ชนกัน', () => {
  const ไฟล์ = { lazada: 'stock-push-sweep.mjs', shopee: 'stock-push-sweep-shopee.mjs', tiktok: 'stock-push-sweep-tiktok.mjs' };
  const ใช้แล้ว = new Map();
  for (const [pf, f] of Object.entries(ไฟล์)) {
    const src = อ่าน(f);
    /* 🔑 ผูกกับ **เจตนา** ไม่ใช่รูปการเขียน (แก้ 19 ก.ย. 2569)
       ของเดิมบังคับข้อความเป๊ะ `กวาดดันสต็อก({ platform: "shopee" })`
       ⇒ วันที่ใครเพิ่มตัวเลือก (เช่น `{ platform: pf, force }`) หรือจัดวรรคใหม่
         **ด่านจะตกทั้งที่โค้ดถูก** ⇒ คลาสที่ขวางการแก้ที่ถูกต้อง (เจอ 4 ครั้งใน 19 ก.ย.)
       ⇒ เกณฑ์ที่ถูก: ไฟล์นี้ต้องเรียกตัวกวาด **ด้วยช่องทางของตัวเอง** และ **ไม่เรียกของเจ้าอื่น** */
    assert.match(src, new RegExp(`กวาดดันสต็อก\\([^)]*platform:\\s*["']${pf}["']`), `${f}: ต้องกวาดช่องทาง ${pf}`);
    for (const อื่น of Object.keys(ไฟล์)) {
      if (อื่น === pf) continue;
      assert.ok(
        !new RegExp(`กวาดดันสต็อก\\([^)]*platform:\\s*["']${อื่น}["']`).test(src),
        `${f}: ต้องไม่เรียกกวาดของช่องทาง ${อื่น} — หนึ่งไฟล์ = หนึ่งเจ้า (กันนาทีชนกันและงบเวลาแตก)`,
      );
    }
    const cron = src.match(/schedule: "([^"]+)"/)[1];
    for (const m of นาที(cron)) {
      assert.ok(!ใช้แล้ว.has(m), `นาที ${m} ชนกันระหว่าง ${ใช้แล้ว.get(m)} กับ ${pf}`);
      ใช้แล้ว.set(m, pf);
    }
  }
});
