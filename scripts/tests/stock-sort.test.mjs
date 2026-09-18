/* ค่าเรียงของเส้น list=stock — รัน: node scripts/tests/stock-sort.test.mjs
 *
 * 🔴 ที่ตัวทดสอบนี้เกิดมาเฝ้า (18 ก.ย. 2569 · ฝั่งจอยิงเทียบทีละค่าแล้วเจอ)
 *    ค่า sort ที่ท่อไม่รองรับ (name · price · buy · available · ค่ามั่ว) **กลายเป็นเรียงตาม qty เงียบ ๆ**
 *    และเส้นนี้ไม่สะท้อนอะไรกลับมา ⇒ ถ้าจอทำปุ่มเรียงครบ 6 ช่องเหมือน ZORT จะได้ **ปุ่มหลอก**
 *    (กดแล้วลำดับไม่ขยับ ไม่มีอะไรบอก) ซึ่งผิดโจทย์ "ห้ามมีปุ่มหลอก" ที่ท่านประธานสั่ง
 */
import { readFileSync } from 'node:fs'
let fail = 0
const ok = (n, c, x = '') => { if (c) console.log(`  ✅ ${n}`); else { fail++; console.log(`  ❌ ${n} ${x}`) } }
const raw = readFileSync('netlify/lib/core-stock.mjs', 'utf8')
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

console.log('① ต้องรองรับค่าเรียงตามคอลัมน์ที่จอ ZORT มีให้กด')
const m = src.match(/const SORTS = \{([\s\S]*?)\};/)
ok('หาแผนที่ค่าเรียงได้', Boolean(m))
const keys = m ? [...m[1].matchAll(/^\s*([a-z]+):/gm)].map((x) => x[1]) : []
for (const k of ['qty', 'sold', 'sku', 'name', 'price', 'buy', 'available']) {
  ok(`รองรับ ${k}`, keys.includes(k), `มีแค่ ${keys.join(',')}`)
}

console.log('② ค่าเรียงต้องชี้ไปที่ alias ที่ SELECT มีจริง (ไม่ตรง = D1 ตอบ error ทั้งคำขอ)')
const body = m ? m[1] : ''
for (const [k, col] of [['name', 'name'], ['price', 'cur.price'], ['buy', 'buy'], ['available', 'avail']]) {
  ok(`${k} เรียงด้วยคอลัมน์ ${col}`, new RegExp(`${k}:\\s*"${col.replace('.', '\\.')}\\s`).test(body), body.slice(0, 80))
}
ok('alias name มีใน SELECT', /AS name/.test(src))
ok('alias avail มีใน SELECT', /AS avail/.test(src))
ok('alias buy มีใน SELECT', /AS buy/.test(src))

console.log('③ ต้องประกาศตัวว่าใช้ค่าไหน และเมินค่าไหน (ไม่ใช่เงียบ)')
for (const f of ['sortApplied', 'sortIgnored', 'sortsSupported']) {
  ok(`ส่งช่อง ${f}`, new RegExp(`${f}[,:]`).test(src))
}
ok('sortIgnored เป็น null เมื่อค่าที่ส่งมารองรับ', /sortIgnored\s*=\s*sortRaw\s*&&\s*!SORTS\[sortRaw\]\s*\?\s*sortRaw\s*:\s*null/.test(src))
ok('ค่าที่ไม่รู้จัก ยังทำงานต่อได้ (ทางถอย qty) ไม่ใช่พังทั้งคำขอ', /SORTS\[sortRaw\]\s*\|\|\s*"cur\.qty ASC"/.test(src))

console.log(fail ? `\n🔴 ตก ${fail} ข้อ` : '\n✅ ผ่านหมด')
process.exit(fail ? 1 : 0)
