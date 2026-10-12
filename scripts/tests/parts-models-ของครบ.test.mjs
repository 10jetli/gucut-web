// รัน: node --experimental-test-module-mocks --test scripts/tests/parts-models-ของครบ.test.mjs
// 13 ต.ค. 2569 — เพิ่มรุ่นอะไหล่ MS180/361/038/360/880 · ด่านนี้เฝ้า "ของที่ประกาศ vs ของที่มีจริง"
//
// 🔴 สองอาการที่เคยเกิดจริง และ **ทั้งคู่ไม่มี error ให้เห็น**
//   ① ใส่ชื่อรุ่นในรายการแต่ไม่มีไฟล์ ⇒ หน้า /parts/<รุ่น> เปิดมาว่างเปล่า
//   ② `จุด` บนภาพอ่านไม่ได้แล้วกลายเป็น "จุดผิด" แทนที่จะเป็น "ไม่มีจุด"
//      ของจริง: f660 มีจุดกลุ่มละ 1 จุด ทั้ง 23 กลุ่ม **ทับเลขหน้ากระดาษ**
//      จอวาดวงกด 40px ให้ ⇒ ลูกค้ากดแล้วได้อะไหล่ผิดชิ้น ⇒ อยู่บนเว็บมาหลายวันโดยไม่มีใครรู้
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const อ่าน = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const รายการ = อ่าน('public/parts/models.json').รุ่น;

test('models.json ต้องตรงกับ PARTS_MODELS ใน parts.ts (ลืมรัน gen = หลังร้านไม่เห็นรุ่นใหม่)', () => {
  // 🔑 ไฟล์นี้คือสิ่งที่ **อีกรีโปอ่านทางเน็ต** — ไม่ตรงกับโค้ด = หลังร้านจับคู่รุ่นที่ไม่มี
  //    หรือมองไม่เห็นรุ่นที่เพิ่งเพิ่ม · ทั้งสองทิศเงียบสนิท ไม่มี error
  const src = readFileSync(new URL('../../src/lib/parts.ts', import.meta.url), 'utf8');
  const ก้อน = src.match(/export const PARTS_MODELS: PartsModel\[\] = \[([\s\S]*?)\n\];/);
  assert.ok(ก้อน, 'หา PARTS_MODELS ใน parts.ts ไม่เจอ');
  const ในโค้ด = [...ก้อน[1].matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(รายการ.map((m) => m.slug), ในโค้ด,
    'models.json ไม่ตรงกับ parts.ts ⇒ รัน `node scripts/gen-parts-models.mjs`');
});

test('ทุกรุ่นที่ประกาศ มีไฟล์ข้อมูลและโฟลเดอร์ภาพจริง', () => {
  assert.ok(รายการ.length >= 6, 'รายการรุ่นหายไป');
  for (const m of รายการ) {
    assert.match(m.slug, /^[a-z0-9]+$/, `slug ใช้เป็น URL ไม่ได้: ${m.slug}`);
    assert.ok(m.คำค้นร้าน, `${m.slug} ไม่มีคำค้นร้าน ⇒ จับคู่ของในร้านไม่ได้เลย`);
    const doc = อ่าน(`public/parts/${m.slug}.json`);
    assert.ok(doc.กลุ่ม?.length, `${m.slug}: ไม่มีกลุ่มสักกลุ่ม`);
    for (const g of doc.กลุ่ม) {
      const รูป = new URL(`../../public/parts/${m.slug}/${g.ภาพ}`, import.meta.url);
      assert.ok(existsSync(รูป), `${m.slug}/${g.ภาพ} ไม่มีไฟล์ — จอจะขึ้นรูปแตก`);
    }
  }
});

test('จุดกดบนภาพต้องตรงกับเลขในตาราง — ไม่งั้นต้องไม่มีจุดเลย + บอกเหตุ', () => {
  for (const m of รายการ) {
    const doc = อ่าน(`public/parts/${m.slug}.json`);
    const จุดรวม = doc.กลุ่ม.reduce((s, g) => s + g.จุด.length, 0);
    if (จุดรวม === 0) {
      // 🔑 ไม่มีจุด **ต้องมีเหตุผลติดมา** — จอเอาไปเขียนบอกลูกค้าแทนคำว่า "แตะวงกลมบนภาพ"
      assert.ok(doc.จุดกดอ่านไม่ได้, `${m.slug}: ไม่มีจุดเลยแต่ไม่บอกเหตุ ⇒ จอจะสัญญาสิ่งที่ไม่มี`);
      continue;
    }
    const อัตรา = [];
    for (const g of doc.กลุ่ม) {
      const เลขตาราง = new Set(g.อะไหล่.map((r) => r.เลข).filter(Boolean));
      if (!เลขตาราง.size) continue;
      const เลขจุด = new Set(g.จุด.map((j) => j.เลข));
      อัตรา.push([...เลขตาราง].filter((x) => เลขจุด.has(x)).length / เลขตาราง.size);
    }
    อัตรา.sort((a, b) => a - b);
    const มัธยฐาน = อัตรา[Math.floor(อัตรา.length / 2)] ?? 0;
    // วัด 13 ต.ค. 2569: เล่มที่ใช้ได้ 0.86–1.00 · เล่มที่เสีย f660 0.00 · f180 0.04 ⇒ ห่างกัน ~8 เท่า
    assert.ok(มัธยฐาน >= 0.3,
      `${m.slug}: จุดกดตรงกับเลขในตารางแค่ ${มัธยฐาน.toFixed(2)} ⇒ เป็นจุดผิด กดแล้วได้ของผิดชิ้น`);
  }
});

test('โฟลเดอร์ภาพที่ไม่มีใครประกาศ = ของค้าง (เตือนด้วยการตก)', () => {
  const ประกาศ = new Set(รายการ.map((m) => m.slug));
  const ในโฟลเดอร์ = readdirSync(new URL('../../public/parts/', import.meta.url), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  const เกิน = ในโฟลเดอร์.filter((x) => !ประกาศ.has(x));
  assert.deepEqual(เกิน, [], `มีโฟลเดอร์ภาพที่ไม่อยู่ในรายการรุ่น: ${เกิน.join(', ')}`);
});
