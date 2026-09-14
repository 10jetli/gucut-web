// รัน: node --experimental-test-module-mocks --test scripts/tests/zort-noapi-probe-names.test.mjs
// กันแดงลวงของ zortclaims (เจอจริงหลัง deploy 14 ก.ย. 2569: ฟ้อง "คำกล่าวอ้างเป็นเท็จ" 3 ข้อ ทั้งที่จริงทุกข้อ)
// กติกา: ชื่อเส้นในรูป โมดูล/ชื่อ ที่อยู่ใน probe ของ ZORT_NO_API จะถูกยิงตรวจว่า "ต้องไม่มี"
//        ⇒ ชื่อเส้นที่โค้ดของเราเรียกใช้อยู่จริง (แปลว่ามีจริง) ห้ามโผล่ในนั้นเด็ดขาด
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mock, test } from 'node:test';

mock.module('@netlify/blobs', { namedExports: { getStore: () => ({ get: async () => null, setJSON: async () => {} }) } });
const { ZORT_NO_API } = await import('../../netlify/lib/zort-write.mjs');

// ตัวดึงชื่อต้องเป็นตัวเดียวกับ zort-claim-check.mjs — อ่านจากไฟล์นั้นตรง ๆ ไม่ลอกมาเขียนใหม่ (กันสองที่ไม่ตรงกัน)
const checkSrc = readFileSync(new URL('../../netlify/lib/zort-claim-check.mjs', import.meta.url), 'utf8');
const reSrc = /const namesIn = \(s\) => \[\.\.\.String\(s \?\? ""\)\.matchAll\((\/.+\/g)\)\]/.exec(checkSrc)?.[1];
assert.ok(reSrc, 'หา regex ของ namesIn ใน zort-claim-check.mjs ไม่เจอ — ถ้าเปลี่ยนรูปโค้ดต้องแก้เทสนี้ด้วย');
const re = new RegExp(reSrc.slice(1, -2), 'g');
const namesIn = (s) => [...String(s ?? '').matchAll(re)].map((m) => m[1]);

// เส้นที่โค้ดเรียกจริง: zortPost("X/Y") · `${BASE}/X/Y` · open-api.zortout.com/v4/X/Y
function usedEndpoints() {
  const dirs = ['../../netlify/lib/', '../../netlify/functions/'];
  const used = new Set();
  for (const d of dirs) {
    const dir = new URL(d, import.meta.url);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.mjs')) continue;
      const src = readFileSync(new URL(f, dir), 'utf8');
      for (const m of src.matchAll(/zortPost\(\s*[`"']([A-Z][A-Za-z]+\/[A-Za-z_]+)/g)) used.add(m[1]);
      for (const m of src.matchAll(/(?:\$\{BASE\}|zortout\.com\/v4)\/([A-Z][A-Za-z]+\/[A-Za-z_]+)/g)) used.add(m[1]);
    }
  }
  return used;
}

test('ตัวเก็บรายชื่อเส้นที่ใช้จริงต้องเจอของที่รู้ว่ามี (ไม่งั้นเทสข้างล่างเขียวลวง)', () => {
  const used = usedEndpoints();
  for (const known of ['Product/AddProduct', 'Product/GetProducts', 'Quotation/AddQuotation']) {
    assert.ok(used.has(known), `ต้องเจอ ${known} ในโค้ด`);
  }
});

test('probe ของ ZORT_NO_API ต้องไม่มีชื่อเส้นที่โค้ดเราเรียกใช้อยู่จริง', () => {
  const used = usedEndpoints();
  const bad = [];
  for (const row of ZORT_NO_API) {
    for (const n of namesIn(row.probe)) if (used.has(n)) bad.push(`${row.what} → ${n}`);
  }
  assert.deepEqual(bad, [], 'ชื่อเหล่านี้มีจริง zortclaims จะฟ้องแดงลวงทุกรอบ — ย้ายไปเขียนใน note แบบไม่มี /');
});

test('แถว "ตั้งค่ากระจายสินค้า" ต้องยังมีชื่อให้ยิงตรวจ (ไม่งั้นคำกล่าวอ้างไม่มีใครตรวจ)', () => {
  const row = ZORT_NO_API.find((r) => r.what.startsWith('ตั้งค่ากระจายสินค้า'));
  assert.ok(row);
  assert.ok(namesIn(row.probe).length >= 4);
});
