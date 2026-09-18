/* เพดานเครดิตต้องไม่ถูกเดา — รัน: node scripts/tests/credits-plan-ceiling.test.mjs
 *
 * 🔴 ที่ตัวทดสอบนี้เกิดมาเฝ้า (18 ก.ย. 2569 · ฝั่งจอเป็นคนทัก · วันเดียวกับที่เว็บล่มเพราะเครดิตหมด)
 *    ของเดิมเขียน `Number(acc?.plan_credits) || 5000` ⇒ ถ้า Netlify ไม่ส่งเพดานมา
 *    จอจะคิด % จากตัวหารที่ผิด **3 เท่า** (ของจริง Pro = 15,000)
 *    ⇒ ใช้จริง 4,000 = 27% แต่จอคิดเป็น 80% แล้วขึ้นเตือน · และไม่มีอะไรบอกว่าตัวหารมาจากไหน
 *
 * ตรวจแบบอ่านซอร์ส เพราะ handler ต้องต่อ Netlify API + Blobs จริง (เรียกตรงในเทสต์ไม่ได้)
 */
import { readFileSync } from 'node:fs'
let fail = 0
const ok = (n, c, x = '') => { if (c) console.log(`  ✅ ${n}`); else { fail++; console.log(`  ❌ ${n} ${x}`) } }
const raw = readFileSync('netlify/functions/netlify-credits.mjs', 'utf8')
/* ⚠️ ต้องตัดคอมเมนต์ออกก่อนตรวจ — ไม่งั้นข้อความอธิบายบั๊กเก่า (ซึ่งมีเลข 5000 อยู่ในนั้น)
   จะทำให้ด่านฟ้องของที่ไม่ได้ผิด = แดงลวง [[probe-fails-toward-alarm]] */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

console.log('① ห้ามมีตัวหารที่เดาเอาแบบเงียบ ๆ')
ok('ไม่มี `|| 5000` (เพดานผิด 3 เท่า) เหลืออยู่', !/\|\|\s*5000/.test(src), 'ยังเจอ')
ok('มีค่าทางถอยเป็นค่าคงที่ที่ตั้งชื่อไว้ ไม่ใช่เลขลอย', /PLAN_FALLBACK\s*=\s*15000/.test(src))

console.log('② ต้องบอกที่มาของเพดาน — จอจะได้รู้ว่าโชว์ % ได้เต็มปากไหม')
for (const f of ['planConfirmed', 'planSource', 'planFallback']) {
  ok(`ส่งช่อง ${f}`, new RegExp(`${f}[:,]`).test(src))
}
ok('planConfirmed เป็นเท็จเฉพาะตอนใช้ทางถอย', /planConfirmed:\s*planSource\s*!==\s*"fallback"/.test(src))
ok('ลำดับที่มา: Netlify → แคชที่ยืนยันแล้ว → ทางถอย',
  /planFromNetlify\s*\|\|\s*planFromCache\s*\|\|\s*PLAN_FALLBACK/.test(src))
ok('แคชใช้ได้เฉพาะรอบที่ยืนยันเพดานไว้แล้ว', /cached\?\.planConfirmed\s*\?\s*cached\.plan/.test(src))

console.log('③ ของเดิมที่ต้องคงไว้ (เคยพลาดมาแล้ว 5 ก.ย.: ตอบ 200 พร้อม object ว่าง แล้วรายงานว่าใช้ไป 0)')
ok('ไม่มีคีย์เลย ⇒ ไม่ใช่ "ใช้ไป 0"', /ไม่มีข้อมูลการใช้งาน|อ่านไม่ได้ ไม่ใช่ใช้ไป 0/.test(src))
ok('ของเก่าดีกว่าไม่มี (stale) ยังอยู่', /stale:\s*true/.test(src))

console.log(fail ? `\n🔴 ตก ${fail} ข้อ` : '\n✅ ผ่านหมด')
process.exit(fail ? 1 : 0)
