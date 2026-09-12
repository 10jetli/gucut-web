/* ชื่อกองสองฝั่งต้องตรงกัน — รัน: node scripts/tests/group-name-parity.test.mjs
 *
 * 🔴 บั๊กที่ตัวทดสอบนี้เกิดมาเฝ้า (เจอ 12 ก.ย. 2569 ด้วยด่านชุด ⑦ ของ CEO):
 *    รายการสรุปประกาศกอง `blank_none_expected` (345 ใบ) แต่แถวส่งชื่อ `blank` (60 แถว)
 *    ⇒ จอที่กรองแถวด้วยชื่อจากรายการสรุป **ไม่เจอแถวกลุ่มนั้นเลยสักใบ และเงียบ**
 *       (ได้ 0 แถวที่หน้าตาเหมือน "ไม่มีใบในกองนี้")
 *    ⇒ ต้นตอ: กติกาประกอบชื่อถูกเขียนไว้ฝั่งเดียว อีกฝั่งไม่ได้เรียกใช้
 *       รากเดียวกับบั๊กปุ่มหมวด POS เช้าวันเดียวกัน
 *
 * 🔑 ด่านนี้ต้องแดงทันทีถ้าใคร **เพิ่มกองใหม่ข้างเดียว** — ซึ่งจะเกิดอีกแน่
 *    วันที่แพลตฟอร์มออกสถานะใหม่ (CEO สั่งให้เป็นด่านประจำ ไม่ใช่ตรวจครั้งเดียว)
 */
import { groupKeyOf, groupsFromCounts } from '../../netlify/lib/order-status.mjs'
/* 🔴 **ต้องเรียกตัวจริงที่ของจริงใช้ ไม่ใช่เลียนแบบตรรกะในเทส**
   เทสรุ่นแรกของไฟล์นี้เลียนแบบเอง ⇒ ตอนลองทำให้พัง (ให้แถวใช้ชื่อเก่า / ถอด blankReason)
   **ยังเขียว** เพราะไม่ได้เดินผ่านโค้ดจริงสักบรรทัด ⇒ ด่านไม่มีคม (กฎ test-must-hit-the-path)
   ⇒ import ตัวเดียวกับที่ listOrders ใช้ */
import { decorateOrderRow, blankReasonFor } from '../../netlify/lib/core-orders.mjs'

let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${name}`)
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

/** ฝั่งแถว: เดินผ่าน **ตัวจริง** ที่ listOrders ใช้
 *  blankReason มาจาก chanMap ที่ท่อคิดให้ ⇒ ป้อนผ่าน Map เหมือนของจริง */
const decorate = (rawStatus, blankReason) =>
  decorateOrderRow(
    { number: 'TEST', channel: 'ช่องทางทดสอบ', integration_status: rawStatus, integrationStatus: rawStatus },
    new Map(blankReason ? [['ช่องทางทดสอบ', blankReason]] : []),
  )
const rowGroup = (rawStatus, blankReason) => decorate(rawStatus, blankReason).shipStatusGroup

console.log('① ชื่อกองของแถว ต้องเป็นชุดย่อยของชื่อกองที่ประกาศ — ทุกตัว ไม่มีข้อยกเว้น')
{
  /* ชุดข้อมูลจำลองรูปเดียวกับที่ฐานส่งมา: [{st, c, blankReason}] */
  const counts = [
    { st: 'confirmed', c: 74 },
    { st: 'delivered', c: 334 },
    { st: '', c: 345, blankReason: 'none_expected' },
    { st: '', c: 12, blankReason: 'source_empty' },
    { st: 'PROCESSED', c: 8 },          // ค่าที่ตัวแปลไม่รู้จัก ⇒ unknown
  ]
  const declared = new Set(groupsFromCounts(counts).map((g) => g.group))
  const rows = [
    rowGroup('confirmed', null), rowGroup('delivered', null),
    rowGroup('', 'none_expected'), rowGroup('', 'source_empty'),
    rowGroup('PROCESSED', null),
  ]
  const extra = rows.filter((g) => !declared.has(g))
  ok('ทุกชื่อกองในแถวมีอยู่ในรายการที่ประกาศ', extra.length === 0, `หลุด: ${[...new Set(extra)].join(', ')}`)
  ok('แถวที่ไม่มีสถานะแบบ "ไม่มีใครบอก" ได้ชื่อเต็ม', rowGroup('', 'none_expected') === 'blank_none_expected')
  ok('แถวที่ไม่มีสถานะแบบ "ต้นทางไม่ส่งมา" ได้ชื่อเต็ม', rowGroup('', 'source_empty') === 'blank_source_empty')
  ok('🔴 แถวต้องไม่ส่งชื่อ "blank" เปล่า ๆ อีก (นั่นคือบั๊กเดิม)', !rows.includes('blank'))
  ok('สองแบบของ "ไม่มีสถานะ" ยังแยกกัน ไม่ถูกรวบ',
     rowGroup('', 'none_expected') !== rowGroup('', 'source_empty'))
  /* ⚠️ ค่าดิบต้องอยู่คู่กันเสมอ — ประกอบชื่อให้แล้วห้ามถอดเหตุผลออก (กฎเดิมของไฟล์นั้น) */
  const rowBlank = decorate('', 'source_empty')
  ok('🔴 แถวกลุ่ม blank ต้องมี blankReason ติดมาด้วย', rowBlank.blankReason === 'source_empty', JSON.stringify(rowBlank))
  ok('แถวที่มีสถานะจริง ไม่ต้องมี blankReason', !('blankReason' in decorate('confirmed', null)))
  ok('แถวยังมีช่องอื่นครบ (shipStatus/known)', !!decorate('confirmed', null).shipStatus && decorate('confirmed', null).shipStatusKnown === true)
}

console.log('② กติกามีที่เดียว — ฝั่งแถวกับฝั่งสรุปต้องได้ชื่อเดียวกันทุกเคส')
{
  const cases = [
    ['confirmed', null], ['delivered', null], ['CANCELLED', null], ['121', null],
    ['', 'none_expected'], ['', 'source_empty'], ['', null], ['ค่าที่ไม่มีในตาราง', null],
  ]
  let bad = []
  for (const [st, reason] of cases) {
    const fromRow = rowGroup(st, reason)
    /* 🔴 ฝั่งนับกองต้องได้ blankReason จาก **ฟังก์ชันกลางตัวเดียวกัน** ไม่ใช่ค่าที่เทสแต่งเอง
       (เคส ['', null] ของจริงไม่มี — ของจริงค่าปริยายเป็น none_expected ทั้งสองฝั่ง
        ตอนเทสแต่งเองมันจึงฟ้องว่าไม่ตรง ซึ่งเป็นการฟ้องที่ถูก: นิพจน์นั้นถูกเขียนซ้ำสองที่) */
    const map = new Map(reason ? [['ช่องทางทดสอบ', reason]] : [])
    const fromSummary = groupsFromCounts([{ st, c: 1, blankReason: blankReasonFor(st, 'ช่องทางทดสอบ', map) }])
      .filter((g) => g.count > 0).map((g) => g.group)[0]
    if (fromRow !== fromSummary) bad.push(`${JSON.stringify([st, reason])}: แถว=${fromRow} สรุป=${fromSummary}`)
  }
  ok('ทั้งสองฝั่งให้ชื่อเดียวกันทุกเคส', bad.length === 0, bad.join(' · '))
}

console.log('③ ค่าปริยายของ "เหตุผลที่สถานะว่าง" ต้องเป็นฝั่งที่ไม่ผิดปกติ')
{
  /* 🔴 ค่าปริยายต้องเป็น none_expected (= ช่องทางนี้ไม่มีใครบอกสถานะ ว่างคือถูกต้อง)
     ถ้าเผลอเปลี่ยนเป็น source_empty ใบปกติ 345 ใบจะถูกป้ายว่า "ต้นทางไม่ส่งมา" = ผิดปกติ
     ⇒ คนจะไปไล่หาปัญหาที่ไม่มี และของผิดปกติจริงจะจมอยู่ในกองนั้น
     ⚠️ ข้อนี้เพิ่มเพราะมิวเทชันนี้ **รอดด่านรอบแรก** (สองฝั่งใช้ฟังก์ชันเดียวกันจึงยังตรงกัน
        แต่ความหมายเปลี่ยนทั้งระบบ) — ตรงกันไม่ได้แปลว่าถูก */
  ok('ช่องทางที่ไม่อยู่ใน map ⇒ none_expected (ฝั่งที่ไม่ผิดปกติ)',
     blankReasonFor('', 'ช่องทางที่ไม่เคยเห็น', new Map()) === 'none_expected',
     String(blankReasonFor('', 'ช่องทางที่ไม่เคยเห็น', new Map())))
  ok('ช่องทางที่ map บอกว่า source_empty ⇒ เคารพค่าใน map',
     blankReasonFor('', 'ช', new Map([['ช', 'source_empty']])) === 'source_empty')
  ok('ใบที่มีสถานะจริง ⇒ null (ไม่ใช่เคสว่าง)', blankReasonFor('confirmed', 'ช', new Map()) === null)
}

console.log('④ ไม่มี blankReason ⇒ คงชื่อ blank ไว้ตามเดิม (ห้ามเดาเหตุผลแทน)')
{
  ok('blankReason เป็น null ⇒ ได้ "blank"', groupKeyOf('blank', null) === 'blank')
  ok('blankReason เป็นค่าว่าง ⇒ ได้ "blank" (ไม่ประกอบชื่อเพี้ยน)', groupKeyOf('blank', '') === 'blank')
  ok('กองอื่นไม่ถูกแตะ แม้ส่ง blankReason มา', groupKeyOf('waiting_ship', 'none_expected') === 'waiting_ship')
}

console.log(fail === 0 ? '\n✅ ผ่านทุกข้อ' : `\n❌ ตก ${fail} ข้อ`)
process.exit(fail === 0 ? 0 : 1)
