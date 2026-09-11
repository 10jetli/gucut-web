/* ทดสอบตัวตรวจรูปร่างคำตอบ Lazada — รัน: node scripts/tests/lazada-shape.test.mjs
 *
 * 🔴 **ป้อนคำตอบปลอมเข้าเส้นทางจริง** — แทนที่แค่ขอบเครือข่าย (`call`)
 *    ตัวตรวจ + ตัวแปลงเป็นของจริงทั้งคู่ (กฎ test-must-hit-the-path)
 *    ห้ามประกอบวัตถุด้วยมือแล้วเรียกตัวตรวจตรง ๆ — อย่างนั้นไม่ได้ทดสอบเส้นที่ของจริงเดิน
 *
 * 🔑 รูปร่าง "ของดี" ในไฟล์นี้ **คัดจากของจริง** (ยิง /api/lazada/fields 12 ก.ย. 2569)
 *    Available/quantity/price/SkuId เป็น number จริง · SellerSku/Status เป็น string
 *    ⇒ เคสที่ 3 (เลขกลายเป็นสตริง) จึงเป็น "ของเปลี่ยน" จริง ไม่ใช่เรื่องปกติที่เราไปห้าม
 */
import { lazadaPageSkus } from '../../netlify/lib/lazada.mjs'

const sku = (over = {}) => ({
  SellerSku: '01412', ShopSku: '5481178422_TH-23257454155', SkuId: 23257454155,
  Status: 'active', quantity: 51, Available: 51, price: 300, ...over,
})
const product = (skus) => ({ item_id: 2103944884, status: 'active', skus })
/** คำตอบหนึ่งหน้าแบบที่ Lazada ส่งมาจริง */
const page = ({ products = [product([sku()])], total = 1724, over = {} } = {}) =>
  ({ code: '0', data: { products, total_products: total, ...over } })

const callOf = (payload) => async () => payload

let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${name}`)
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

/** เดินเส้นจริง แล้วบอกว่าได้ผลหรือหยุด */
async function run(payload) {
  try {
    return { value: await lazadaPageSkus(0, callOf(payload)) }
  } catch (e) {
    return { error: String(e?.message ?? e) }
  }
}

console.log('① รูปร่างถูก ⇒ ผ่านปกติ (ต้องได้ของออกมาเหมือนเดิม)')
{
  const r = await run(page())
  ok('ไม่โยน error', !r.error, r.error)
  ok('คืนรายการสินค้า', r.value?.items?.length === 1)
  ok('คืนยอดที่แพลตฟอร์มประกาศเป็นตัวเลข', r.value?.total === 1724, String(r.value?.total))
  ok('SellerSku ว่างได้ ไม่ถือว่ารูปร่างพัง (ของจริงมี)',
     !(await run(page({ products: [product([sku({ SellerSku: '' })])] }))).error)
}

console.log('② ฟิลด์หาย ⇒ หยุด และบอกชื่อฟิลด์')
{
  const noProducts = await run({ code: '0', data: { total_products: 10 } })
  ok('data.products หาย ⇒ หยุด', !!noProducts.error)
  ok('ข้อความบอกว่า data.products หาย', /data\.products.*หาย/.test(noProducts.error || ''), noProducts.error)

  const noTotal = await run(page({ over: { total_products: undefined } }))
  ok('total_products หาย ⇒ หยุด', !!noTotal.error)
  ok('ข้อความบอกชื่อ total_products', /total_products/.test(noTotal.error || ''), noTotal.error)

  const skuNoAvail = await run(page({ products: [product([sku({ Available: undefined })])] }))
  ok('ฟิลด์ระดับ sku หาย ⇒ หยุด (ด่าน 0 แถวจับเคสนี้ไม่ได้)', !!skuNoAvail.error)
  ok('ข้อความบอกทั้งชื่อฟิลด์และ SellerSku ที่เกิดปัญหา',
     /Available/.test(skuNoAvail.error || '') && /01412/.test(skuNoAvail.error || ''), skuNoAvail.error)

  const noSkus = await run(page({ products: [{ item_id: 99, status: 'active' }] }))
  ok('product ไม่มีช่อง skus ⇒ หยุด พร้อมบอก item', /skus.*หาย/.test(noSkus.error || '') && /99/.test(noSkus.error || ''), noSkus.error)
}

console.log('③ ชนิดผิด (ตัวเลขกลายเป็นข้อความ) ⇒ หยุด')
{
  const strQty = await run(page({ products: [product([sku({ quantity: '51' })])] }))
  ok('quantity เป็นสตริง ⇒ หยุด', !!strQty.error)
  ok('ข้อความบอกว่าได้ string มาแทน number', /quantity.*number.*string/.test(strQty.error || ''), strQty.error)

  const strTotal = await run(page({ over: { total_products: '1724' } }))
  ok('total_products เป็นสตริง ⇒ หยุด', !!strTotal.error, strTotal.error)

  const numSku = await run(page({ products: [product([sku({ SellerSku: 1412 })])] }))
  ok('SellerSku เป็นตัวเลข ⇒ หยุด', /SellerSku.*string/.test(numSku.error || ''), numSku.error)

  const arrData = await run({ code: '0', data: [] })
  ok('data เป็น array ⇒ หยุด (ไม่ใช่ปล่อยผ่านเพราะ typeof เป็น object)',
     /data .*array/.test(arrData.error || ''), arrData.error)
}

console.log('④ หลายจุดพร้อมกัน ⇒ รายงานหลายจุด ไม่ใช่จุดแรกแล้วจบ')
{
  const many = await run(page({
    products: [product([sku({ Available: undefined, quantity: 'x' }), sku({ Status: 5 })])],
  }))
  const parts = (many.error || '').split(' · ').length
  ok('บอกมากกว่าหนึ่งจุด', parts >= 3, `${parts} จุด: ${many.error}`)
  ok('มีคำว่า "หยุดไว้ก่อน ไม่เดาค่าแทน" ให้คนอ่านรู้ว่าระบบไม่ได้เดา',
     /หยุดไว้ก่อน ไม่เดาค่าแทน/.test(many.error || ''))
}

console.log(fail === 0 ? '\n✅ ผ่านทุกข้อ' : `\n❌ ตก ${fail} ข้อ`)
process.exit(fail === 0 ? 0 : 1)
