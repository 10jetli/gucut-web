/* ทดสอบรายชื่อช่องทางที่ปิดแล้ว — รัน: node scripts/tests/closed-channels.test.mjs
 *
 * 🔴 ข้อที่ตัวทดสอบนี้เกิดมาเฝ้าเป็นข้อแรก: **closedAt ต้องแยกจาก recordedAt**
 *    ผมเกือบใส่ closedAt = วันนี้ (วันที่เรารู้) ซึ่งจะทำให้กติกา "ใบใหม่กว่าวันปิดต้องเตือน"
 *    ไม่มีวันทำงาน เพราะใบ ZAMA ทั้ง 5,958 ใบลงวันที่ก่อนหน้านั้นหมด ⇒ ตัวตรวจเขียวตลอดกาล
 *    (CEO จับได้ก่อนลงมือ 12 ก.ย. 2569)
 */
import {
  putClosedChannel, removeClosedChannel, isClosedChannel, orderVsClosed,
  getClosedChannel, listClosedChannels,
} from '../../netlify/lib/closed-channels.mjs'

let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${name}`)
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

console.log('① บันทึกช่องทางที่ปิด — สองวันที่ต้องแยกกัน')
{
  const r = putClosedChannel({}, { store: 'z2', channel: 'ZAMA', closedAt: null, note: 'ท่านประธานแจ้ง', by: 'gucut2', now: '2026-09-12' })
  ok('บันทึกได้', !r.error, r.error)
  const rec = getClosedChannel(r.map, 'z2', 'ZAMA')
  ok('closedAt เป็น null เพราะยังไม่รู้วันปิด', rec?.closedAt === null, JSON.stringify(rec))
  ok('recordedAt = วันที่เราบันทึก', rec?.recordedAt === '2026-09-12')
  ok('🔴 สองช่องไม่ถูกยุบเป็นช่องเดียว', 'closedAt' in rec && 'recordedAt' in rec)
  const r2 = putClosedChannel(r.map, { store: 'z1', channel: 'Shopify', closedAt: '2026-08-28', now: '2026-09-12' })
  ok('ช่องทางที่รู้วันปิด ใส่วันได้', getClosedChannel(r2.map, 'z1', 'Shopify')?.closedAt === '2026-08-28')
  ok('และ recordedAt ยังเป็นวันนี้ ไม่ใช่วันปิด', getClosedChannel(r2.map, 'z1', 'Shopify')?.recordedAt === '2026-09-12')
  ok('อยู่คนละร้านกันได้ ไม่ทับกัน', listClosedChannels(r2.map).length === 2)
}

console.log('② ไม่ส่ง closedAt หรือส่งค่าเพี้ยน ⇒ ตีกลับ (ห้ามเดาแทน)')
{
  ok('ไม่ส่ง closedAt ⇒ error', !!putClosedChannel({}, { store: 'z1', channel: 'X' }).error)
  ok('closedAt เป็นค่าว่าง ⇒ error', !!putClosedChannel({}, { store: 'z1', channel: 'X', closedAt: '' }).error)
  ok('closedAt รูปแบบผิด ⇒ error', !!putClosedChannel({}, { store: 'z1', channel: 'X', closedAt: '28/08/2026' }).error)
  ok('ไม่มีชื่อช่องทาง ⇒ error', !!putClosedChannel({}, { store: 'z1', channel: '  ', closedAt: null }).error)
  ok('🔴 ไม่ส่งร้านมา ⇒ error (ห้ามเดาว่าเป็นร้านหลัก)', !!putClosedChannel({}, { channel: 'X', closedAt: null }).error)
  ok('closedAt = null ⇒ ผ่าน (null คือคำตอบที่ถูกต้องเมื่อยังไม่รู้)',
     !putClosedChannel({}, { store: 'z1', channel: 'X', closedAt: null }).error)
}

console.log('③ เทียบตรงตัวทั้งร้านและชื่อ — "ZAMA Shopee" และ TIKTOK ของอีกร้าน ต้องไม่ถูกปิดไปด้วย')
{
  const { map } = putClosedChannel({}, { store: 'z2', channel: 'ZAMA', closedAt: null })
  ok('z2/ZAMA อยู่ในรายชื่อ', isClosedChannel(map, 'z2', 'ZAMA'))
  ok('🔴 z2/ZAMA Shopee ต้องไม่ถือว่าปิด (ถ้าใช้ includes จะพลาดข้อนี้)', !isClosedChannel(map, 'z2', 'ZAMA Shopee'))
  ok('ตัวพิมพ์ใหญ่-เล็กต่างกันคือคนละช่องทาง', !isClosedChannel(map, 'z2', 'zama'))
  ok('ชื่อเดียวกันแต่คนละร้าน = ยังเปิด', !isClosedChannel(map, 'z1', 'ZAMA'))
  /* 🔴 ข้อที่สำคัญที่สุด: ปิด TIKTOK ของ z2 **ต้องไม่** ทำให้ TIKTOK ของ z1 ที่ยังขายอยู่ถูกปิด
     ของจริง 12 ก.ย. 2569: z1/TIKTOK ใบล่าสุด 11 ก.ย. (ยังขาย) · z2/TIKTOK 22 ก.พ. (เงียบ 202 วัน) */
  const both = putClosedChannel(map, { store: 'z2', channel: 'TIKTOK', closedAt: null }).map
  ok('ปิด z2/TIKTOK ได้', isClosedChannel(both, 'z2', 'TIKTOK'))
  ok('🔴 z1/TIKTOK ที่ยังขายอยู่ ต้องไม่ถูกปิดไปด้วย', !isClosedChannel(both, 'z1', 'TIKTOK'))
}

console.log('④ กติกา "ใบใหม่กว่าวันปิด" — สามค่า ห้ามยุบเป็นสอง')
{
  const known = { closedAt: '2026-02-21', recordedAt: '2026-09-12' }
  ok('ใบหลังวันปิด ⇒ after-closed (ต้องเตือนเสียงดัง)', orderVsClosed(known, '2026-03-01') === 'after-closed')
  ok('ใบก่อนวันปิด ⇒ before-closed', orderVsClosed(known, '2026-02-20') === 'before-closed')
  ok('ใบวันเดียวกับวันปิด ⇒ ไม่ถือว่าผิดปกติ', orderVsClosed(known, '2026-02-21') === 'before-closed')
  const unknown = { closedAt: null, recordedAt: '2026-09-12' }
  ok('🔴 ยังไม่รู้วันปิด ⇒ unknown ไม่ใช่ before-closed', orderVsClosed(unknown, '2026-03-01') === 'unknown')
  ok('วันที่ใบเพี้ยน ⇒ unknown ไม่ใช่ผ่าน', orderVsClosed(known, 'เมื่อวาน') === 'unknown')
  ok('ไม่มีข้อมูลเลย ⇒ unknown', orderVsClosed(null, '2026-03-01') === 'unknown')
}

console.log('⑤ ถอนออกจากรายชื่อ')
{
  const { map } = putClosedChannel({}, { store: 'z2', channel: 'ZAMA', closedAt: null })
  ok('ถอนได้', !removeClosedChannel(map, 'z2', 'ZAMA').error)
  ok('ถอนแล้วไม่เหลือ', !isClosedChannel(removeClosedChannel(map, 'z2', 'ZAMA').map, 'z2', 'ZAMA'))
  ok('ถอนชื่อที่ไม่มี ⇒ error (ไม่แกล้งสำเร็จ)', !!removeClosedChannel(map, 'z2', 'ไม่มีช่องนี้').error)
  ok('ถอนจากร้านที่ไม่มี ⇒ error', !!removeClosedChannel(map, 'z9', 'ZAMA').error)
  ok('ของเดิมไม่ถูกแก้ (คืนก้อนใหม่)', isClosedChannel(map, 'z2', 'ZAMA'))
}

console.log(fail === 0 ? '\n✅ ผ่านทุกข้อ' : `\n❌ ตก ${fail} ข้อ`)
process.exit(fail === 0 ? 0 : 1)
