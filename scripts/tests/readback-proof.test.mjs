/* ตัวพิสูจน์ว่าการดันสต็อกถึงหน้าร้านจริง — รัน: node scripts/tests/readback-proof.test.mjs
 *
 * 🔴 บั๊กที่ไฟล์นี้เกิดมาเฝ้า (CEO เจอ 12 ก.ย. 2569 ตอนตอบคำถามท่านประธานว่าสินค้าเปิดขายอยู่ไหม):
 *    `lazadaReadBack` เขียนว่า `p.push || p.pushSample || []` แต่ **ไม่ได้ขอ full**
 *    ⇒ คีย์ push ไม่มีจริง ⇒ ตกไปใช้ `pushSample` (25 แถว) **ทุกครั้ง**
 *    ⇒ รหัสที่อยู่เกินแถวที่ 25 ถูกตอบว่า **landed โดยไม่เคยถูกตรวจ**
 *    วัดจริงวันนั้น: lazada wouldPush 21 (พอดี) · shopee 34 · tiktok 33 ⇒ สองเจ้าเกินเพดานแล้ว
 *    ⚠️ เงียบเป็นพิเศษเพราะ **ยิ่งของเยอะยิ่งผิดบ่อย** ⇒ พังตอนที่เราต้องการมันที่สุด
 *
 * 🔑 ฉีดแผนเข้าไปแทนการยิงออกนอก (แทนที่แค่ขอบ) — ตัวตัดสินทั้งหมดเป็นของจริง
 */
import { lazadaReadBack } from '../../netlify/lib/stock-push-live.mjs'
import { planFrom } from '../../netlify/lib/stock-push.mjs'

let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${name}`)
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}
/** แถวเข้าตัววางแผน: ต่างกัน ⇒ เข้าแผน · coreQty ติดลบ ⇒ ถูกข้าม · known:false ⇒ ไม่รู้จัก */
const row = (sku, platformQty, coreQty, known = true) => ({ sku, name: `ของ ${sku}`, platformQty, coreQty, known })
/** แผนจริงจาก planFrom — ไม่ได้ประกอบคำตอบด้วยมือ */
const planOf = (rows, full) => ({ lazada: planFrom(rows, full) })
const dryRunOf = (rows, full) => async () => planOf(rows, full)

console.log('① เกณฑ์หลักของงาน: รหัสที่อยู่เกินเพดานตัวอย่าง ⇒ ต้องได้ unknown ไม่ใช่ landed')
{
  /* 40 รหัสที่ต้องดัน (เกินเพดานตัวอย่าง 25) — ถาม sku ที่อยู่ท้ายสุดของแผน */
  const rows = Array.from({ length: 40 }, (_, i) => row(`S${String(i).padStart(2, '0')}`, i + 1, 500 + i))
  const full = planFrom(rows, true)
  ok('ของจริงเกินเพดานตัวอย่างแน่นอน', full.wouldPush === 40 && full.pushSample.length === 25)
  const beyond = full.push.slice(25).map((r) => r.sku)
  ok('มีรหัสที่อยู่นอกตัวอย่าง', beyond.length === 15)

  /* (ก) ท่อส่งรายการเต็มมา ⇒ ต้องตอบ notLanded ถูกต้อง */
  const good = await lazadaReadBack(beyond.slice(0, 3), { dryRun: dryRunOf(rows, true) })
  ok('ขอ full แล้วตอบ notLanded ให้รหัสที่ยังต้องดัน', good.notLanded.length === 3 && !good.landed.length, JSON.stringify(good).slice(0, 120))

  /* (ข) ท่อไม่ส่งรายการเต็ม (สภาพเดิมของบั๊ก) ⇒ **ต้องไม่ตอบ landed** */
  const noFull = await lazadaReadBack(beyond.slice(0, 3), { dryRun: dryRunOf(rows, false) })
  ok('🔴 ไม่มีรายการเต็ม ⇒ unknown ทั้งหมด', (noFull.unknown || []).length === 3 && !noFull.landed.length, JSON.stringify(noFull).slice(0, 140))
  ok('🔴 ห้ามมีรหัสไหนถูกตอบว่า landed เลย', (noFull.landed || []).length === 0)
  ok('บอกเหตุผลว่าทำไมตรวจไม่ได้', /รายการเต็ม/.test(noFull.unknown?.[0]?.why || ''), noFull.unknown?.[0]?.why)
  /* 🔑 ต้องมี **รหัสเหตุผลที่เครื่องอ่านได้** ไม่ใช่มีแต่ข้อความ (CEO สั่ง)
     ⇒ คนอ่านผลแยกได้ว่า unknown แต่ละตัวมาจากเหตุผลไหน โดยไม่ต้องแกะข้อความด้วย includes() */
  ok('unknown มีรหัสเหตุผล no_full_plan', noFull.unknown?.every((u) => u.reason === 'no_full_plan'), JSON.stringify(noFull.unknown?.[0]))
}

console.log('② ของที่ตรงกันแล้วจริง ⇒ ยัง landed เหมือนเดิม')
{
  const rows = [row('A', 5, 5), row('B', 1, 9)]   // A ตรงกัน · B ต่าง
  const r = await lazadaReadBack(['A'], { dryRun: dryRunOf(rows, true) })
  ok('A ได้ landed', r.landed.includes('A') && !r.notLanded.length, JSON.stringify(r).slice(0, 120))
  const r2 = await lazadaReadBack(['B'], { dryRun: dryRunOf(rows, true) })
  ok('B ได้ notLanded', r2.notLanded[0]?.sku === 'B')
}

console.log('③ 🔴 "ไม่อยู่ในแผน" ไม่ได้แปลว่า landed — ของที่ถูกข้ามต้องเป็น unknown')
{
  const rows = [row('NEG', 3, -5), row('UNK', 2, null, false), row('OK', 7, 7)]
  const r = await lazadaReadBack(['NEG', 'UNK', 'OK'], { dryRun: dryRunOf(rows, true) })
  const why = Object.fromEntries((r.unknown || []).map((u) => [u.sku, u.why]))
  ok('รหัสที่ข้ามเพราะคลังติดลบ ⇒ unknown', /ติดลบ/.test(why.NEG || ''), JSON.stringify(r).slice(0, 160))
  ok('รหัสที่คลังไม่รู้จัก ⇒ unknown', /ไม่รู้จัก/.test(why.UNK || ''))
  const byReason = Object.fromEntries((r.unknown || []).map((u) => [u.sku, u.reason]))
  ok('🔑 รหัสเหตุผลแยกสองแบบออกจากกัน',
     byReason.NEG === 'skipped_negative' && byReason.UNK === 'skipped_unknown', JSON.stringify(byReason))
  ok('มีสรุปจำนวนแยกตามเหตุผล', r.unknownByReason?.skipped_negative === 1 && r.unknownByReason?.skipped_unknown === 1,
     JSON.stringify(r.unknownByReason))
  ok('ของที่ตรงกันจริงยัง landed', r.landed.includes('OK'))
  ok('🔴 ของที่ถูกข้ามต้องไม่อยู่ใน landed', !r.landed.includes('NEG') && !r.landed.includes('UNK'))
}

console.log('④ แผนไม่ครบ (มีคนตัดรายการ) ⇒ unknown ทั้งก้อน')
{
  const rows = Array.from({ length: 30 }, (_, i) => row(`T${i}`, i + 1, 900 + i))
  const p = planFrom(rows, true)
  const cut = { lazada: { ...p, push: p.push.slice(0, 10) } }   // wouldPush 30 แต่ถือไว้ 10
  const r = await lazadaReadBack(['T0', 'T29'], { dryRun: async () => cut })
  ok('ตอบ unknown ทั้งหมด', (r.unknown || []).length === 2 && !r.landed.length)
  ok('เหตุผลบอกว่าแผนไม่ครบพร้อมตัวเลข', /แผนสดไม่ครบ: ถือไว้ 10 แถว จากที่ควรมี 30/.test(r.unknown[0].why), r.unknown[0].why)
}

console.log('⑤ 🔴 รายการกองที่ถูกข้ามไม่ครบ ⇒ ห้ามตอบ landed (เจอตอนไล่ข้อ 3 ของ CEO)')
{
  /* ต้นทางจริง: shopeePlan/lazadaPlan ประกอบกอง "คลังไม่รู้จัก" จาก missingSample (ตัด 20)
     ⇒ ตัวนับถูก แต่รายการเป็นตัวอย่าง ⇒ รหัสที่เกิน 20 จะหลุดไปกอง landed ถ้าไม่ดัก */
  const rows = [row('OK', 7, 7), row('U1', 2, null, false)]
  const p = planFrom(rows, true)
  const short = { lazada: { ...p, skipUnknown: 25, skipUnknownFull: p.skipUnknownFull.slice(0, 1) } }
  const r = await lazadaReadBack(['OK'], { dryRun: async () => short })
  ok('รหัสที่ไม่อยู่ในรายการใด ๆ ⇒ unknown (ไม่ใช่ landed)', (r.unknown || []).length === 1 && !r.landed.length, JSON.stringify(r).slice(0, 170))
  ok('เหตุผลบอกตัวเลขรายการ/ตัวนับให้เห็น', /ไม่รู้จัก 1\/25/.test(r.unknown?.[0]?.why || ''), r.unknown?.[0]?.why)
  ok('รหัสเหตุผลเป็น skip_lists_incomplete (แยกจากสองแบบข้างบน)',
     r.unknown?.[0]?.reason === 'skip_lists_incomplete', r.unknown?.[0]?.reason)
  const r2 = await lazadaReadBack(['U1'], { dryRun: async () => short })
  ok('รหัสที่เจอในรายการ ยังตอบเหตุผลเฉพาะได้ปกติ', /ไม่รู้จักรหัสนี้/.test((r2.unknown || [])[0]?.why || ''), JSON.stringify(r2).slice(0, 140))
}

console.log('⑥ ตัวเทียบหยุด (skip) ⇒ error ไม่ใช่ landed')
{
  const r = await lazadaReadBack(['X'], { dryRun: async () => ({ lazada: { skip: 'ยังไม่ได้เชื่อมร้าน' } }) })
  ok('ได้ error', !!r.error && !r.landed, JSON.stringify(r).slice(0, 120))
}

console.log(fail === 0 ? '\n✅ ผ่านทุกข้อ' : `\n❌ ตก ${fail} ข้อ`)
process.exit(fail === 0 ? 0 : 1)
