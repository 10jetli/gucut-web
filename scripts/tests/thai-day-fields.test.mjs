/* วันไทยที่ท่อส่งให้จอ — รัน: node scripts/tests/thai-day-fields.test.mjs
 *
 * 🔴 ที่ตัวทดสอบนี้เกิดมาเฝ้า (18 ก.ย. 2569 · ฝั่งจอเป็นคนจับได้):
 *    SQLite เขียนเวลาด้วย datetime('now') = **UTC** ⇒ จอที่ตัด 10 ตัวแรกเป็น "วัน"
 *    จะได้วัน UTC แล้วเอาไปเทียบกับวันไทย ⇒ **ค่าที่เขียนช่วง 17:00–24:00 UTC ให้อายุแก่เกินจริง 1 วัน**
 *    ⇒ ท่อต้องส่งวันไทยสำเร็จรูป และชื่อฟิลด์ต้องมี TH กำกับ เพื่อไม่ให้ใครต้องเดาเขตเวลา
 */
import { readFileSync } from 'node:fs'

let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${name}`)
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

// ดึงตัวแปลงออกมาจากไฟล์จริง (ไฟล์นั้นต้องต่อ D1/ZORT ⇒ import ทั้งไฟล์ไม่ได้ในเทสต์)
const src = readFileSync('netlify/lib/shopee-stock.mjs', 'utf8')
const m = src.match(/const thaiDayOf = \([\s\S]*?\n\};/)
ok('หาตัวแปลง thaiDayOf ในไฟล์ท่อได้', Boolean(m))
const thaiDayOf = eval(`(${m[0].replace(/^const thaiDayOf = /, '').replace(/;$/, '')})`)

console.log('① ช่วงเวลาที่เคยทำให้อายุเพี้ยน (17:00–24:00 UTC) ต้องได้วันไทยของ "วันรุ่งขึ้น"')
ok('2026-09-17 20:30:00 UTC ⇒ 2026-09-18', thaiDayOf('2026-09-17 20:30:00') === '2026-09-18', String(thaiDayOf('2026-09-17 20:30:00')))
ok('2026-09-16 23:59:00 UTC ⇒ 2026-09-17', thaiDayOf('2026-09-16 23:59:00') === '2026-09-17', String(thaiDayOf('2026-09-16 23:59:00')))
ok('17:00:00 UTC ตรง ⇒ วันรุ่งขึ้น (เที่ยงคืนไทย)', thaiDayOf('2026-09-17 17:00:00') === '2026-09-18', String(thaiDayOf('2026-09-17 17:00:00')))
ok('16:59:59 UTC ⇒ ยังวันเดิม', thaiDayOf('2026-09-17 16:59:59') === '2026-09-17', String(thaiDayOf('2026-09-17 16:59:59')))

console.log('② เวลาที่ไม่อยู่ในช่วงบั๊ก ต้องได้วันเดิม (กันแก้เกินจนเลื่อนทุกค่า)')
ok('2026-09-14 14:48:49 UTC ⇒ 2026-09-14', thaiDayOf('2026-09-14 14:48:49') === '2026-09-14', String(thaiDayOf('2026-09-14 14:48:49')))
ok('เช้า UTC ⇒ วันเดิม', thaiDayOf('2026-09-14 01:00:00') === '2026-09-14')

console.log('③ อ่านไม่ออก = null ห้ามเดาเป็นวันนี้')
ok('ค่าว่าง ⇒ null', thaiDayOf('') === null && thaiDayOf(null) === null && thaiDayOf(undefined) === null)
ok('ข้อความที่ไม่ใช่เวลา ⇒ null', thaiDayOf('ไม่ใช่เวลา') === null, String(thaiDayOf('ไม่ใช่เวลา')))
ok('รูป ISO ที่มี Z อยู่แล้วก็อ่านได้', thaiDayOf('2026-09-17T20:30:00Z') === '2026-09-18')

console.log('④ ท่อต้องส่งช่องที่มี TH กำกับออกไปจริง (ไม่ใช่แค่มีตัวแปลง)')
for (const f of ['stockDayTH', 'recipeDayTH', 'recipeCheckedDayTH']) {
  ok(`ส่งช่อง ${f}`, src.includes(`${f}:`), 'ไม่พบในไฟล์')
}
ok('ยังส่ง stockDay เดิมไว้ (จอรุ่นเก่าไม่พัง)', /\n\s*stockDay: day,/.test(src))

console.log(fail ? `\n🔴 ตก ${fail} ข้อ` : '\n✅ ผ่านหมด')
process.exit(fail ? 1 : 0)
