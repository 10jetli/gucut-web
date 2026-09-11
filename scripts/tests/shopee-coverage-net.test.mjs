/* ทดสอบตาข่าย sawAll ของ shopee-stock — รัน: node scripts/tests/shopee-coverage-net.test.mjs
 *
 * 🔴 ป้อน **หน้าเพจปลอมเข้าลูปจริง** ไม่ประกอบผลลัพธ์ด้วยมือ (กฎ test-must-hit-the-path)
 *    บทเรียน 11 ก.ย. 2569: เคยเขียนตัวตรวจที่เขียวตลอดกาล แล้วพิสูจน์ว่า "แดงได้"
 *    ด้วยวัตถุที่โค้ดไม่มีทางผลิตออกมา ⇒ การทดสอบนั้นไม่ได้ทดสอบอะไรเลย
 * ⇒ ที่นี่แทนที่แค่ขอบเครือข่าย (ตัวดึงหนึ่งหน้า) ลูปไล่หน้า/ตัวนับ/ตัวตั้งธงเป็นของจริง
 */
import { collectShopeeItemIds } from '../../netlify/lib/shopee-stock.mjs'

const items = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ item_id: from + i + 1 }))

/** หน้าเพจปลอม · pages = จำนวนสินค้าต่อหน้า · totalCount = ยอดที่ Shopee ประกาศ */
const pager = (pages, totalCount, { loseNextFlag = false } = {}) => {
  let n = 0
  return async () => {
    const i = n++
    const last = i === pages.length - 1
    return {
      response: {
        item: items(pages[i] ?? 0, i * 100),
        ...(totalCount === undefined ? {} : { total_count: totalCount }),
        has_next_page: last || loseNextFlag ? false : true,
      },
    }
  }
}

const cases = [
  ['ของดี: 2 หน้า (100+20) ยอดประกาศ 120', pager([100, 20], 120), true],
  ['ของดี: หน้าเดียว 7 ยอดประกาศ 7', pager([7], 7), true],
  ['🧪 ของเสียจริง: ประกาศ 250 แต่ส่งมา 120', pager([100, 20], 250), false],
  ['🧪 ของเสียจริง: ธง has_next_page หลุด เดินได้หน้าเดียวจาก 2', pager([100, 20], 120, { loseNextFlag: true }), false],
  ['ไม่รู้: Shopee ไม่ได้บอกยอดรวม', pager([7], undefined), null],
]

let bad = 0
for (const [name, fetchPage, want] of cases) {
  const got = await collectShopeeItemIds(fetchPage)
  const ok = got.sawAll === want
  if (!ok) bad++
  console.log(ok ? '✓' : '❌', String(got.sawAll).padEnd(5),
    `ได้ ${got.ids.length} · ประกาศ ${got.declared}`, '·', name)
}
console.log(bad ? `🔴 ตาข่ายยังแยกแยะไม่ได้ (${bad})` : '✅ ตาข่ายแดงได้จริงจากของเสียที่ลูปจริงผลิตออกมา')
