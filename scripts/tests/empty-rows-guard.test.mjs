/* ตาข่าย "ได้ 0 รายการ = หยุด" ของสามแพลตฟอร์ม — รัน: node scripts/tests/empty-rows-guard.test.mjs
 *
 * 🔴 อาการที่ตาข่ายนี้กัน (เจอของจริง 11 ก.ย. 2569): ตัวดึงรายการสินค้าคืนกองว่างได้
 *    **โดยไม่มี error** เมื่อแพลตฟอร์มตอบ 200 พร้อม payload ที่ไม่มีรายการ (รูปแบบเปลี่ยน ·
 *    ตอบผิดรูประหว่างมีปัญหาฝั่งเขา) ⇒ ตัวเทียบเดินต่อจนจบแล้วได้ผล **"ศูนย์ครบทุกช่อง"**
 *    ⇒ แผนดันสต็อกอ่านว่า "ไม่มีอะไรต้องดัน" ทั้งที่มีของรออยู่ · และ bucketsAddUp ยัง true
 *    ⚠️ ศูนย์อันตรายกว่าว่างเปล่า เพราะว่างทำให้คนสงสัย แต่ศูนย์ทำให้คนสบายใจ
 *
 * ⚠️ ทดสอบด้วยการ **ป้อนหน้าเพจปลอมเข้าลูปจริง** แทนที่แค่ขอบเครือข่าย
 *    (test-must-hit-the-path — ห้ามประกอบผลลัพธ์ด้วยมือ)
 */
import { collectLazadaRows } from '../../netlify/lib/lazada.mjs'
import { collectShopeeItemIds } from '../../netlify/lib/shopee-stock.mjs'
import { collectTiktokStock } from '../../netlify/lib/tiktok-stock.mjs'

const results = []
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  results.push(ok)
  console.log(ok ? '✓' : '❌', name, '⇒', JSON.stringify(got), ok ? '' : `(ควรเป็น ${JSON.stringify(want)})`)
}

/* ── Lazada: fetchPage(offset) => { items, total } ── */
const lzProd = (sku) => ({ skus: [{ SellerSku: sku, Available: 5, quantity: 5, Status: 'active' }] })
check('lazada · ของจริงมีสินค้า',
  await collectLazadaRows(async () => ({ items: [lzProd('LZ-1'), lzProd('LZ-2')], total: 2 }))
    .then((r) => ({ rows: r.rows.length, declared: r.declared })), { rows: 2, declared: 2 })
check('lazada · payload ไม่มีรายการ (แพลตฟอร์มบอกว่ามี 1900)',
  await collectLazadaRows(async () => ({ items: [], total: 1900 }))
    .then((r) => ({ rows: r.rows.length, declared: r.declared })), { rows: 0, declared: 1900 })
check('lazada · payload รูปแบบเปลี่ยน (ไม่มีทั้ง items และ total)',
  await collectLazadaRows(async () => ({ data: { somethingElse: true } }))
    .then((r) => ({ rows: r.rows.length, declared: r.declared })), { rows: 0, declared: null })

/* ── Shopee: fetchPage(query) => { response: { item, total_count, has_next_page } } ── */
check('shopee · ของจริงมีสินค้า',
  await collectShopeeItemIds(async () => ({ response: { item: [{ item_id: 1 }, { item_id: 2 }], total_count: 2, has_next_page: false } }))
    .then((r) => ({ ids: r.ids.length, declared: r.declared })), { ids: 2, declared: 2 })
check('shopee · payload ไม่มีรายการ (แพลตฟอร์มบอกว่ามี 320)',
  await collectShopeeItemIds(async () => ({ response: { item: [], total_count: 320, has_next_page: false } }))
    .then((r) => ({ ids: r.ids.length, declared: r.declared })), { ids: 0, declared: 320 })
check('shopee · payload รูปแบบเปลี่ยน',
  await collectShopeeItemIds(async () => ({ somethingElse: true }))
    .then((r) => ({ ids: r.ids.length, declared: r.declared })), { ids: 0, declared: null })

/* ── TikTok: fetchPage(query) => { data: { products, total_count, next_page_token } } ── */
const ttProd = (i) => ({ title: `สินค้า ${i}`, skus: [{ seller_sku: `TT-${i}`, inventory: [{ quantity: 3 }] }] })
check('tiktok · ของจริงมีสินค้า',
  await collectTiktokStock(async () => ({ data: { products: [ttProd(1), ttProd(2)], total_count: 2, next_page_token: '' } }))
    .then((r) => ({ rows: r.rows.length, declared: r.apiTotal })), { rows: 2, declared: 2 })
check('tiktok · payload ไม่มีรายการ (แพลตฟอร์มบอกว่ามี 287)',
  await collectTiktokStock(async () => ({ data: { products: [], total_count: 287, next_page_token: '' } }))
    .then((r) => ({ rows: r.rows.length, declared: r.apiTotal })), { rows: 0, declared: 287 })
check('tiktok · payload รูปแบบเปลี่ยน',
  await collectTiktokStock(async () => ({ somethingElse: true }))
    .then((r) => ({ rows: r.rows.length, declared: r.apiTotal })), { rows: 0, declared: null })

const bad = results.filter((r) => !r).length
console.log(bad
  ? `🔴 ไม่ผ่าน ${bad} เคส`
  : '✅ ทั้งสามเจ้า: กองว่างถูกตรวจจับได้ และยอดที่แพลตฟอร์มประกาศถูกส่งต่อให้ตัวตัดสินใจ')
process.exit(bad ? 1 : 0)
