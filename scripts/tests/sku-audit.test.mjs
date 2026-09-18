// รัน: node --test scripts/tests/sku-audit.test.mjs
// "รหัสต้องตรงกันทุกแพลตฟอร์ม" — ท่านประธานสั่ง 18 ก.ย. 2569
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSkuIndex } from '../../netlify/lib/sku-match.mjs';
import { auditSkus } from '../../netlify/lib/sku-audit.mjs';

const ของเรา = (...a) => new Set(a);

test('รหัสบนแพลตฟอร์มที่ตรงกับ "รหัสชุด" ของเรา ต้องไม่นับเป็นการเดา', () => {
  const listings = { '00073-11.8-NW': ['shopee'], '00073-11.8-KK': ['shopee'] };
  // ก่อนแก้: ไม่รู้จักรหัสชุด ⇒ ตัดท้ายมาเป็น 00073 แล้วนับเป็น base
  const เดิม = buildSkuIndex(listings);
  assert.equal(เดิม.methodOf('00073').shopee, 'base', 'ถ้าไม่บอกว่าเรามีชุด มันต้องเดา (พฤติกรรมเดิม)');

  // หลังแก้: บอกว่าเรามีรหัสชุดจริง ⇒ ต้องไม่เดาให้รหัสฐานอีก
  const ใหม่ = buildSkuIndex(listings, { ownSkus: ของเรา('00073', '00073-11.8-NW', '00073-11.8-KK') });
  assert.equal(ใหม่.methodOf('00073').shopee, undefined, 'รหัสชุดมีบ้านของตัวเอง ห้ามแปะเป็นการเดาให้รหัสฐาน');
  assert.equal(ใหม่.methodOf('00073-11.8-NW').shopee, 'exact', 'ตัวชุดเองต้องเป็นตรงตัว');
});

test('รหัสตัวเลือกที่คลังไม่มีจริง ต้องยังเดาให้รหัสฐาน (ของจริงที่ต้องเตือน ห้ามเงียบ)', () => {
  // `01780-11.5-KK` มีขายบน Shopee จริงแต่คลังเราไม่มี ⇒ ต้องยังโผล่เป็นการเดาให้ `01780`
  const idx = buildSkuIndex({ '01780-11.5-KK': ['shopee'] }, { ownSkus: ของเรา('01780') });
  assert.equal(idx.methodOf('01780').shopee, 'base', 'รหัสที่คลังไม่มีต้องยังเตือน ไม่ใช่เงียบไป');
});

test('รหัสที่ไม่มีขีดเลย ไม่เคยถูกโยงกับรหัสฐานอยู่แล้ว — ห้ามเข้าใจผิดว่าเป็นบั๊ก', () => {
  /* 🔑 จดไว้เพราะเกือบสรุปผิดวันนี้: ทูลทิปบนจอตัดบรรทัดจนอ่านเป็น `00073KK`
     ผมเกือบไล่หาว่าทำไมรหัสนั้นถูกโยงกับ `00073` — ของจริงคือ `00073-11.5-KK`
     ตัวตัดท้ายทำงานที่เครื่องหมายขีดเท่านั้น รหัสไม่มีขีดจึงไม่มีทางโยงได้เลย */
  const idx = buildSkuIndex({ '00073KK': ['shopee'] }, { ownSkus: ของเรา('00073') });
  assert.equal(idx.methodOf('00073').shopee, undefined, 'ไม่มีขีด = ไม่ถูกตัดท้าย = ไม่โยงกับรหัสฐาน');
  assert.equal(idx.methodOf('00073KK').shopee, 'exact', 'มันเป็นรหัสของตัวมันเอง');
});

test('เพดานรายชื่อต้องไม่ทำให้ตัวเลขโกหก — มีตัวนับจำนวนจริงกำกับ', () => {
  const many = {};
  for (let i = 0; i < 9; i++) many[`00369-${i}T`] = ['shopee'];
  const idx = buildSkuIndex(many, { ownSkus: ของเรา('00369') });
  assert.equal(idx.countFrom('00369').shopee, 9, 'ต้องบอกจำนวนจริง');
  assert.equal(idx.fromOf('00369', 3).shopee.length, 3, 'ตัดได้ตามที่ขอ');
  assert.equal(idx.fromOf('00369').shopee.length, 9, 'ค่าเริ่มต้นต้องไม่ตัดที่ 5 เหมือนเดิม');
});

test('รายงาน: แยกสามกองที่ต้องลงมือคนละทาง', () => {
  const r = auditSkus({
    listings: {
      '00073-11.8-NW': ['shopee', 'lazada'],   // ทั้งคู่ใช้ตรงกัน + เรามี
      '01780-11.5-KK': ['shopee'],             // เราไม่มี ⇒ กอง ①
      '00817-22T': ['shopee'],                 // lazada ไม่มีรหัสนี้ ⇒ กอง ②
      '00817-29T': ['shopee', 'lazada'],
    },
    ourSkus: ของเรา('00073', '00073-11.8-NW', '00817', '00817-22T', '00817-29T', '09999'),
    checked: ['shopee', 'lazada'],
  });
  assert.deepEqual(r.ไม่มีในคลัง.map((x) => x.code), ['01780-11.5-KK']);
  assert.equal(r.ไม่มีในคลัง[0].maybeBase, null, 'ไม่มีรหัสฐานให้ชี้ทางก็ต้องบอกตรง ๆ ว่าไม่มี');
  assert.equal(r.สรุป.ไม่ตรงกันข้ามแพลตฟอร์ม, 1);
  assert.deepEqual(r.ไม่ตรงกันข้ามแพลตฟอร์ม[0].onlySome, ['00817-22T'], 'ต้องชี้ตัวที่บางเจ้ามี บางเจ้าไม่มี');
  assert.ok(r.ไม่ได้ลงขายเลย.includes('09999'), 'รหัสที่ไม่ได้ลงขายที่ไหนเลยต้องถูกแยกไว้');
});

test('🔴 ช่องทางที่ตรวจไม่ได้รอบนี้ ห้ามนับเป็น "ไม่ได้ลงขาย"', () => {
  // lazada ไม่อยู่ใน checked (เช่นวันที่ล่ม) ⇒ ของที่ขายเฉพาะ lazada ต้องไม่ถูกตัดสิน
  const r = auditSkus({
    listings: { '05555': ['lazada'] },
    ourSkus: ของเรา('05555'),
    checked: ['shopee'],
  });
  assert.equal(r.สรุป.ไม่มีในคลัง, 0, 'ห้ามฟ้องรหัสจากช่องทางที่ยังตรวจไม่ได้');
  assert.ok(r.ไม่ได้ลงขายเลย.includes('05555'),
    'ถูกต้องตามขอบเขตที่ประกาศ: รอบนี้ดูแค่ shopee — และหมายเหตุในผลบอกไว้แล้ว');
  assert.match(r.ขอบเขต.หมายเหตุ, /ไม่ได้นับเป็น/);
});

test('🔴 แถวรหัสฐานต้องยังบอกว่า "ขายอยู่" ไม่ใช่เงียบไปเฉย ๆ', () => {
  /* เห็นจากจอจริงของท่านประธาน 19 ก.ย. 2569:
     รอบแรกผมแค่ข้ามรหัสชุด ⇒ จุดส้มหายจริง **แต่คอลัมน์กลายเป็นขีด**
     ซึ่งคนอ่านว่า "ไม่ได้ขายที่ไหนเลย" ทั้งที่ขายอยู่บน Shopee/TikTok ผ่านรหัสชุด
     ⇒ เอาคำเตือนที่ผิดออก แล้วได้ความเงียบที่ผิดแทน ซึ่งแย่กว่า */
  const listings = { '00073-11.8-NW': ['shopee'], '00073-11.8-KK': ['tiktok'] };
  const idx = buildSkuIndex(listings, {
    ownSkus: ของเรา('00073', '00073-11.8-NW', '00073-11.8-KK'),
    bundleSkus: ของเรา('00073-11.8-NW', '00073-11.8-KK'),
  });
  assert.deepEqual(idx.tagsOf('00073').sort(), ['shopee', 'tiktok'], 'แถวรหัสฐานต้องยังขึ้นโลโก้');
  assert.equal(idx.methodOf('00073').shopee, 'bundle', 'ต้องเป็น bundle ไม่ใช่ base (ห้ามขึ้นจุดส้ม)');
  assert.equal(idx.methodOf('00073').tiktok, 'bundle');
  assert.deepEqual(idx.bundlesOf('00073').shopee, ['00073-11.8-NW'], 'บอกได้ว่าขายผ่านชุดไหน');
  assert.deepEqual(idx.fromOf('00073'), {}, 'ต้องไม่มีอะไรอยู่ในกอง "เดา" อีก');
});

test('รหัสชุดปนกับรหัสที่เราไม่มี — ต้องแยกกันได้ ไม่กลืนกัน', () => {
  const idx = buildSkuIndex(
    { '00073-11.8-NW': ['shopee'], '00073-99XX': ['shopee'] },
    { ownSkus: ของเรา('00073', '00073-11.8-NW'), bundleSkus: ของเรา('00073-11.8-NW') },
  );
  assert.equal(idx.methodOf('00073').shopee, 'bundle', 'ของที่แน่นอนกว่าชนะ');
  assert.deepEqual(idx.fromOf('00073').shopee, ['00073-99XX'], 'ตัวที่เราไม่มีต้องยังอยู่ในกองเดา ให้ตามแก้ได้');
});
