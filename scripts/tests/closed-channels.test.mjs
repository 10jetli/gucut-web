/* ทดสอบรายชื่อช่องทางที่ปิดแล้ว — รัน: node scripts/tests/closed-channels.test.mjs
 *
 * 🔴 ข้อที่ตัวทดสอบนี้เกิดมาเฝ้าเป็นข้อแรก: **closedAt ต้องแยกจาก recordedAt**
 *    ผมเกือบใส่ closedAt = วันนี้ (วันที่เรารู้) ซึ่งจะทำให้กติกา "ใบใหม่กว่าวันปิดต้องเตือน"
 *    ไม่มีวันทำงาน เพราะใบ ZAMA ทั้ง 5,958 ใบลงวันที่ก่อนหน้านั้นหมด ⇒ ตัวตรวจเขียวตลอดกาล
 *    (CEO จับได้ก่อนลงมือ 12 ก.ย. 2569)
 */
import {
  putClosedChannel, removeClosedChannel, isClosedChannel, orderVsClosed,
} from '../../netlify/lib/closed-channels.mjs'

let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${name}`)
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

console.log('① บันทึกช่องทางที่ปิด — สองวันที่ต้องแยกกัน')
{
  const r = putClosedChannel({}, { channel: 'ZAMA', closedAt: null, note: 'ท่านประธานแจ้ง', by: 'gucut2', now: '2026-09-12' })
  ok('บันทึกได้', !r.error, r.error)
  const rec = r.map?.ZAMA
  ok('closedAt เป็น null เพราะยังไม่รู้วันปิด', rec?.closedAt === null, JSON.stringify(rec))
  ok('recordedAt = วันที่เราบันทึก', rec?.recordedAt === '2026-09-12')
  ok('🔴 สองช่องไม่ถูกยุบเป็นช่องเดียว', 'closedAt' in rec && 'recordedAt' in rec)
  const r2 = putClosedChannel(r.map, { channel: 'Shopify', closedAt: '2026-08-28', now: '2026-09-12' })
  ok('ช่องทางที่รู้วันปิด ใส่วันได้', r2.map?.Shopify?.closedAt === '2026-08-28')
  ok('และ recordedAt ยังเป็นวันนี้ ไม่ใช่วันปิด', r2.map?.Shopify?.recordedAt === '2026-09-12')
}

console.log('② ไม่ส่ง closedAt หรือส่งค่าเพี้ยน ⇒ ตีกลับ (ห้ามเดาแทน)')
{
  ok('ไม่ส่ง closedAt ⇒ error', !!putClosedChannel({}, { channel: 'X' }).error)
  ok('closedAt เป็นค่าว่าง ⇒ error', !!putClosedChannel({}, { channel: 'X', closedAt: '' }).error)
  ok('closedAt รูปแบบผิด ⇒ error', !!putClosedChannel({}, { channel: 'X', closedAt: '28/08/2026' }).error)
  ok('ไม่มีชื่อช่องทาง ⇒ error', !!putClosedChannel({}, { channel: '  ', closedAt: null }).error)
  ok('closedAt = null ⇒ ผ่าน (null คือคำตอบที่ถูกต้องเมื่อยังไม่รู้)',
     !putClosedChannel({}, { channel: 'X', closedAt: null }).error)
}

console.log('③ เทียบชื่อตรงตัวเท่านั้น — "ZAMA Shopee" ต้องไม่ถูกปิดไปด้วย')
{
  const { map } = putClosedChannel({}, { channel: 'ZAMA', closedAt: null })
  ok('ZAMA อยู่ในรายชื่อ', isClosedChannel(map, 'ZAMA'))
  ok('🔴 ZAMA Shopee ต้องไม่ถือว่าปิด (ถ้าใช้ includes จะพลาดข้อนี้)', !isClosedChannel(map, 'ZAMA Shopee'))
  ok('ตัวพิมพ์ใหญ่-เล็กต่างกันคือคนละช่องทาง', !isClosedChannel(map, 'zama'))
  ok('ชื่อที่ไม่มีในรายชื่อ = ยังเปิด', !isClosedChannel(map, 'Lazada-gucut'))
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
  const { map } = putClosedChannel({}, { channel: 'ZAMA', closedAt: null })
  ok('ถอนได้', !removeClosedChannel(map, 'ZAMA').error)
  ok('ถอนแล้วไม่เหลือ', !isClosedChannel(removeClosedChannel(map, 'ZAMA').map, 'ZAMA'))
  ok('ถอนชื่อที่ไม่มี ⇒ error (ไม่แกล้งสำเร็จ)', !!removeClosedChannel(map, 'ไม่มีช่องนี้').error)
  ok('ของเดิมไม่ถูกแก้ (คืนก้อนใหม่)', isClosedChannel(map, 'ZAMA'))
}

console.log(fail === 0 ? '\n✅ ผ่านทุกข้อ' : `\n❌ ตก ${fail} ข้อ`)
process.exit(fail === 0 ? 0 : 1)
