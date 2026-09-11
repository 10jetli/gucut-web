/* ทดสอบตาข่าย sawAllProducts ของ tiktok-stock — รัน: node scripts/tests/tiktok-coverage-net.test.mjs
 *
 * 🔴 **ทำไมเขียนแบบป้อนหน้าเพจปลอมเข้าลูปจริง ไม่ใช่ประกอบผลลัพธ์ด้วยมือ** (11 ก.ย. 2569)
 *    วันเดียวกันนี้เคยเขียนตัวตรวจที่เขียวตลอดกาล แล้ว "พิสูจน์ว่าแดงได้" ด้วยการประกอบ
 *    วัตถุคำตอบด้วยมือ — ซึ่งโค้ดจริงไม่มีทางผลิตออกมาได้ ⇒ การทดสอบนั้นไม่ได้ทดสอบอะไรเลย
 *    (กฎ test-must-hit-the-path: ผลถูก ≠ บรรทัดนั้นถูกเรียก)
 * ⇒ ที่นี่แทนที่ **แค่ขอบเครือข่าย** (ตัวดึงหนึ่งหน้า) ส่วนลูปไล่หน้า/ตัวนับ/ตัวตั้งธง
 *   เป็นโค้ดของจริงทั้งหมด · ของเสียที่ป้อนคือของที่ TikTok ส่งมาได้จริง (ยอดประกาศไม่ตรงกับหน้าที่ส่ง)
 */
import { collectTiktokStock } from '../../netlify/lib/tiktok-stock.mjs'

const prod = (i, skus = 1) => ({
  title: `สินค้า ${i}`,
  skus: Array.from({ length: skus }, (_, k) => ({ seller_sku: `TT-${i}-${k}`, inventory: [{ quantity: 5 }] })),
})

/** หน้าเพจปลอม: pages = [[สินค้า...], ...] · totalCount = ยอดที่ "แพลตฟอร์ม" ประกาศ */
const pager = (pages, totalCount, { dropLastPageToken = false } = {}) => {
  let n = 0
  return async () => {
    const i = n++
    const last = i === pages.length - 1
    return {
      data: {
        products: pages[i] ?? [],
        total_count: totalCount,
        next_page_token: last || dropLastPageToken ? '' : `tok${i + 1}`,
      },
    }
  }
}

const cases = [
  ['ของดี: 2 หน้า 3 สินค้า ยอดประกาศ 3', pager([[prod(1), prod(2)], [prod(3)]], 3), true],
  ['ของดี: หน้าเดียว 1 สินค้า', pager([[prod(1)]], 1), true],
  ['🧪 ของเสียจริง: แพลตฟอร์มบอก 5 แต่ส่งมา 3 (หน้าหาย)', pager([[prod(1), prod(2), prod(3)]], 5), false],
  ['🧪 ของเสียจริง: token หลุดกลางทาง เดินได้หน้าเดียวจาก 2', pager([[prod(1)], [prod(2)]], 2, { dropLastPageToken: true }), false],
  ['ไม่รู้: แพลตฟอร์มไม่ได้บอกยอดรวม', pager([[prod(1)]], undefined), null],
]

let bad = 0
for (const [name, fetchPage, want] of cases) {
  const got = await collectTiktokStock(fetchPage)
  const ok = got.sawAllProducts === want
  if (!ok) bad++
  console.log(ok ? '✓' : '❌', String(got.sawAllProducts).padEnd(5),
    `เดินผ่าน ${got.productsSeen} · แพลตฟอร์มบอก ${got.apiTotal} · sku ${got.rows.length}`, '·', name)
}
/* เคสที่ต้องไม่สับสนหน่วย: สินค้า 2 ตัวมี 3 sku — ธงต้องยังเขียว (เทียบสินค้า ไม่ใช่ sku) */
const multi = await collectTiktokStock(pager([[prod(9, 2), prod(10, 1)]], 2))
const okUnit = multi.sawAllProducts === true && multi.rows.length === 3
if (!okUnit) bad++
console.log(okUnit ? '✓' : '❌', 'หน่วยไม่สับสน: สินค้า 2 ตัว / sku 3 ตัว ⇒ ธงเขียว', multi.sawAllProducts, multi.rows.length)
console.log(bad ? `🔴 ตาข่ายยังแยกแยะไม่ได้ (${bad})` : '✅ ตาข่ายแดงได้จริงจากของเสียที่ลูปจริงผลิตออกมา')
