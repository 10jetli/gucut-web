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

/* ⚠️ **20 ต.ค. 2569 — แหล่งความจริงย้ายที่ ด่านนี้จึงย้ายตาม (คำถามเดิมทุกข้อ)**
   `const SORTS = {...}` ไม่ใช่ของที่พิมพ์ไว้แล้ว — มันถูก **คิดจาก** `ช่องเรียง` (ช่อง→คอลัมน์)
   กับ `ทิศเดิมของชื่อ` เพื่อให้เส้นนี้รับได้ทั้งชื่อเดิมและรูป `sort=<ช่อง>&dir=<ทิศ>`
   (คุณส้มขอ 16:02 "ชื่อเดิมยังใช้ได้") ⇒ อ่านตาราง SORTS เป็นตัวหนังสือไม่ได้อีก
   🔑 **ไม่ได้ลดข้อตรวจลงสักข้อ** — ย้ายไปอ่านแหล่งจริงแทน
   📎 ส่วนที่ด่านอ่านซอร์สทำไม่ได้ (ทิศของแต่ละชื่อให้ ORDER BY อะไรจริง) ถูกตรึงด้วยการ
      **วัดพฤติกรรม** ที่ `scripts/tests/ส่งต่อการเรียง.test.mjs` — ชื่อเดิม 10 ตัวถูกตรึงเป็นตัวหนังสือ
      ที่นั่น ⇒ ใครรีแฟคเตอร์สูตรแล้วทิศเพี้ยน ใบนั้นแดงทันที (ปลูกบั๊กทดสอบแล้ว) */
console.log('① ต้องรองรับค่าเรียงตามคอลัมน์ที่จอ ZORT มีให้กด')
const m = src.match(/const ช่องเรียง = \{([\s\S]*?)\};/)
ok('หาแผนที่ช่อง→คอลัมน์ได้', Boolean(m))
const keys = m ? [...m[1].matchAll(/([a-z]+):/g)].map((x) => x[1]) : []
for (const k of ['qty', 'sold', 'sku', 'name', 'price', 'buy', 'available']) {
  ok(`รองรับ ${k}`, keys.includes(k), `มีแค่ ${keys.join(',')}`)
}
// ชื่อเดิมที่ฝังทิศไว้ในชื่อ ต้องยังใช้ได้ (จอที่ deploy อยู่ส่งชื่อชุดนี้)
const มีชื่อฝังทิศ = src.match(/const ชื่อฝังทิศ = \{([\s\S]*?)\};/)
ok('ยังมีชื่อเดิมที่ฝังทิศไว้', Boolean(มีชื่อฝังทิศ))
for (const k of ['qtydesc', 'pricelow', 'availablelow']) {
  ok(`ชื่อเดิม ${k} ยังใช้ได้`, Boolean(มีชื่อฝังทิศ) && มีชื่อฝังทิศ[1].includes(k),
    'ถอดชื่อนี้ = จอที่ขึ้นแล้วกดเรียงไม่ได้')
}

console.log('② ค่าเรียงต้องชี้ไปที่ alias ที่ SELECT มีจริง (ไม่ตรง = D1 ตอบ error ทั้งคำขอ)')
const body = m ? m[1] : ''
for (const [k, col] of [['name', 'name'], ['price', 'cur.price'], ['buy', 'buy'], ['available', 'avail'],
                        ['qty', 'p.onhand'], ['sold', 'sold30'], ['sku', 'cur.sku']]) {
  ok(`${k} เรียงด้วยคอลัมน์ ${col}`,
    new RegExp(`${k}:\\s*"${col.replace('.', '\\.')}"`).test(body), body.slice(0, 120))
}
ok('alias name มีใน SELECT', /AS name/.test(src))
ok('alias avail มีใน SELECT', /AS avail/.test(src))
ok('alias buy มีใน SELECT', /AS buy/.test(src))

console.log('③ ต้องประกาศตัวว่าใช้ค่าไหน และเมินค่าไหน (ไม่ใช่เงียบ)')
/* 🔴 เพิ่ม 20 ต.ค. 2569 — ฝั่งจอเปิดปุ่มเรียงที่หัวคอลัมน์เมื่อ `applied.sortDefaulted === false`
   ไม่มีสองคีย์นี้ = เธออ่าน undefined !== false แล้วหัวคอลัมน์เป็นตัวหนังสือธรรมดาตลอดกาล */
for (const f of ['sortApplied', 'sortIgnored', 'sortsSupported', 'sortDefaulted']) {
  ok(`ส่งช่อง ${f}`, new RegExp(`${f}[,:]`).test(src))
}
ok('sortIgnored เป็น null เมื่อค่าที่ส่งมารองรับ', /sortIgnored\s*=\s*sortRaw\s*&&\s*!SORTS\[sortRaw\]\s*\?\s*sortRaw\s*:\s*null/.test(src))
ok('ค่าที่ไม่รู้จัก ยังทำงานต่อได้ (ทางถอย onhand) ไม่ใช่พังทั้งคำขอ', /SORTS\[sortRaw\]\s*\|\|\s*"p\.onhand ASC"/.test(src))

console.log(fail ? `\n🔴 ตก ${fail} ข้อ` : '\n✅ ผ่านหมด')
process.exit(fail ? 1 : 0)
