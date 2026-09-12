/* ทดสอบกติกาหมวดสินค้าของเครื่องคิดเงิน — รัน: node scripts/tests/pos-category.test.mjs
 *
 * 🔴 บั๊กที่ตัวทดสอบนี้เกิดมาเฝ้า (วัดครบทั้ง 57 ปุ่มบนของจริง 12 ก.ย. 2569):
 *    `posCats()` สร้างรหัสปุ่มจากหมวดจริงในทะเบียนสินค้า (`z:<หมวด>`)
 *    แต่ `lookup()` กรองด้วยตัวเดาหมวดจากชื่อ ⇒ **ปุ่มหมวด ZORT ทั้ง 42 ปุ่ม
 *    (ครอบ 2,533 รหัส = 95% ของคลัง) กดแล้วได้ 0 แถว** และเงียบสนิท
 *    เพราะ 0 แถวหน้าตาเหมือน "หมวดนี้ไม่มีของ" ทุกประการ
 *    ⇒ แก้โดยรวมกติกาเป็นฟังก์ชันเดียว (categoryOfRow) ใช้ทั้งสองฝั่ง
 *
 * ⚠️ ตัวทดสอบนี้ตรวจ **กติกา** ได้อย่างเดียว — การยิงครบ 57 ปุ่มกับการบวกยอดเทียบ 2,672
 *    ต้องทำบนของจริงหลัง deploy (ต้องมีฐาน D1) · อย่าเข้าใจว่าเขียวที่นี่แล้วจบ
 */
import { categoryOfRow, filterByCategory } from '../../netlify/lib/pos.mjs'

let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${name}`)
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

/* แถวรูปเดียวกับที่ SQL คืนมาจริง — lookup ใช้ชื่อช่อง cat_real · posCats ใช้ cat */
const row = (sku, name, cat = null, key = 'cat_real') => ({ sku, name, qty: 1, price: 10, [key]: cat })

console.log('① หมวดจริงจากทะเบียน ZORT มาก่อนการเดาเสมอ')
{
  const r = row('00313', 'หัวเทียน NEWWAVE เลเซอร์', 'อะไหล่ MS 070')
  const g = categoryOfRow(r)
  ok('ได้รหัสแบบ z: ตามหมวดจริง', g.code === 'z:อะไหล่ MS 070', g.code)
  ok('ติดธงว่ามาจาก ZORT', g.zort === true)
  /* ชื่อนี้ตัวเดาจะจัดเป็น "หัวเทียน" ⇒ ถ้ากติกากลับด้าน ข้อนี้จะแดง */
  ok('ไม่ถูกตัวเดาแย่งไป', g.code !== 'plug')
  ok('อ่านช่อง cat ของ posCats ได้ด้วย (กติกาเดียวกันสองฝั่ง)',
     categoryOfRow(row('00313', 'หัวเทียน', 'อะไหล่ MINI', 'cat')).code === 'z:อะไหล่ MINI')
}

console.log('② ไม่มีหมวดจริงเท่านั้น จึงเดาจากชื่อ — และต้องติดธงว่าเดา')
{
  for (const cat of [null, '', '   ', undefined]) {
    const g = categoryOfRow(row('X1', 'โซ่เลื่อยยนต์ NEWWAVE 3636', cat))
    ok(`cat=${JSON.stringify(cat)} ⇒ เดาจากชื่อ + ธง zort เป็น false`, g.zort === false && !!g.code, g.code)
  }
  ok('ชื่อที่จัดกลุ่มไม่ได้ ไปกอง "อื่น ๆ" ไม่ใช่ค่าว่าง', categoryOfRow(row('X9', 'ของอะไรก็ไม่รู้')).code === 'other')
}

console.log('③ กรองตามหมวด — ของที่ได้ต้องตรงกับรหัสที่ขอ')
{
  const rows = [
    row('A', 'หัวเทียน', 'อะไหล่ MS 070'),
    row('B', 'ลูกสูบ', 'อะไหล่ MS 070'),
    row('C', 'โซ่ NEWWAVE 3636', 'อะไหล่ MINI'),
    row('D', 'โซ่เลื่อยยนต์ NEWWAVE 3636'),      // ไม่มีหมวดจริง ⇒ เดา
  ]
  const z = filterByCategory(rows, 'z:อะไหล่ MS 070')
  ok('ได้เฉพาะแถวของหมวดนั้น', z.picked.map((r) => r.sku).join('') === 'AB', z.picked.map((r) => r.sku).join(''))
  ok('ไม่ติดธงไม่รู้จักหมวด', z.unknownCat === false)
  ok('บอกว่าในผลนี้มีแถวที่มาจากการเดา 0 แถว', z.guessedRows === 0)

  const g = filterByCategory(rows, categoryOfRow(rows[3]).code)
  ok('หมวดที่เดาจากชื่อก็กรองได้', g.picked.map((r) => r.sku).join('') === 'D', g.picked.map((r) => r.sku).join(''))
  ok('และ **ประกาศตัวว่าผลนี้มาจากการเดา**', g.guessedRows === 1)

  ok('ไม่ส่งรหัสหมวดมา ⇒ คืนทุกแถว', filterByCategory(rows, '').picked.length === 4)
}

console.log('④ หมวดที่ไม่มีอยู่จริง ⇒ 0 แถว **พร้อมบอกว่าไม่รู้จักหมวด** (ทำให้พังดู)')
{
  const rows = [row('A', 'หัวเทียน', 'อะไหล่ MS 070')]
  const u = filterByCategory(rows, 'z:หมวดที่ไม่มีอยู่จริง')
  ok('ได้ 0 แถว', u.picked.length === 0)
  ok('🔴 ติดธง unknownCat — ไม่ใช่ 0 แถวเงียบ ๆ แบบบั๊กเดิม', u.unknownCat === true)
  const u2 = filterByCategory(rows, 'p-8800')
  ok('รหัสหมวดที่เดาแต่ไม่มีของ ก็ต้องติดธงเหมือนกัน', u2.unknownCat === true && u2.picked.length === 0)
  ok('ข้อมูลว่างเปล่า ⇒ ไม่ throw และติดธงไม่รู้จักหมวด',
     filterByCategory(null, 'z:อะไร').unknownCat === true)
}

console.log('⑤ กติกาของสองฝั่งต้องมาจากฟังก์ชันเดียว (กันบั๊กเดิมกลับมา)')
{
  /* จำลองสิ่งที่ทั้งสองฝั่งทำ: ฝั่งปุ่มนับจำนวนต่อรหัส · ฝั่งกรองดึงของตามรหัส
     ถ้าสองฝั่งใช้กติกาคนละชุด เลขจะไม่ตรง — ข้อนี้คือบั๊กเดิมเป๊ะ ๆ */
  const rows = [
    row('A', 'หัวเทียน', 'อะไหล่ MS 070'), row('B', 'ลูกสูบ', 'อะไหล่ MS 070'),
    row('C', 'โซ่ NEWWAVE', 'อะไหล่ MINI'), row('D', 'โซ่เลื่อยยนต์ NEWWAVE 3636'),
    row('E', 'ของอะไรก็ไม่รู้'),
  ]
  const count = new Map()
  for (const r of rows) {
    const c = categoryOfRow(r).code
    count.set(c, (count.get(c) ?? 0) + 1)
  }
  let mismatch = []
  for (const [code, items] of count) {
    const got = filterByCategory(rows, code).picked.length
    if (got !== items) mismatch.push(`${code}: ปุ่มบอก ${items} แต่กรองได้ ${got}`)
  }
  ok('เลขบนปุ่มตรงกับของที่กรองได้ ทุกหมวด', mismatch.length === 0, mismatch.join(' · '))
  ok('ผลบวกของทุกหมวด = จำนวนแถวทั้งหมด (ไม่มีของหายและไม่มีของนับซ้ำ)',
     [...count.values()].reduce((a, b) => a + b, 0) === rows.length)
}

console.log(fail === 0 ? '\n✅ ผ่านทุกข้อ' : `\n❌ ตก ${fail} ข้อ`)
process.exit(fail === 0 ? 0 : 1)
