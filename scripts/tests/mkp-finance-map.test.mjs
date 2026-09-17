/* ทดสอบการจับคู่คอลัมน์การเงินมาร์เก็ตเพลส — รัน: node scripts/tests/mkp-finance-map.test.mjs
 *
 * 🔴 สามข้อที่ตัวทดสอบนี้เกิดมาเฝ้า (เรียงตามความเสียหายถ้าพลาด)
 *   ① **ชื่อผู้ซื้อ/ข้อความอิสระต้องไม่หลุดออกมาในคำตอบ** — Shopee ส่ง buyer_name มาในรายการกระเป๋าเงิน
 *      repo เป็น public และคำตอบถูกก๊อปลงรายงานได้ ⇒ หลุดคือเรื่องจริง ไม่ใช่เรื่องสไตล์
 *   ② **"อ่านไม่ได้" ต้องเป็น null ห้ามเป็น 0** — 0 บาทแปลว่ามีรายการที่เป็นศูนย์ ซึ่งเป็นคำตอบคนละอัน
 *   ③ **วันต้องคิดแบบไทย (UTC+7)** — รายการช่วงเช้าไทยจะตกไปวันก่อนถ้าตัดวันด้วย UTC
 */
import { mapShopee, mapLazada, mapTiktok, money, thaiDay, readMarketplaceFinance } from '../../netlify/lib/mkp-finance.mjs'

let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) console.log(`  ✅ ${name}`)
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

console.log('① ข้อมูลส่วนบุคคลต้องไม่หลุด')
{
  const row = mapShopee({
    transaction_id: 77, create_time: 1757000000, transaction_type: 'ESCROW_VERIFIED_ADD',
    money_flow: 'MONEY_IN', amount: 1234.5, current_balance: 9999, order_sn: '2509ABC',
    buyer_name: 'ชื่อผู้ซื้อจริง', description: 'โอนเข้าจากคำสั่งซื้อของ ชื่อผู้ซื้อจริง',
    reason: 'x', remarks: { note: 'ชื่อผู้ซื้อจริง' },
  })
  const s = JSON.stringify(row)
  ok('ไม่มี buyer_name ในผล', !('buyer_name' in row))
  ok('ไม่มีชื่อผู้ซื้อโผล่ในค่าใด ๆ', !s.includes('ชื่อผู้ซื้อจริง'), s)
  ok('ไม่เอา description/reason/remarks มาด้วย', !('description' in row) && !('reason' in row) && !('remarks' in row))
  ok('เก็บเลขที่จำเป็นไว้ครบ', row.amount === 1234.5 && row.orderRef === '2509ABC' && row.flow === 'MONEY_IN')

  const lz = mapLazada({
    transaction_number: 'T1', transaction_date: '2026-09-10', amount: '-35.50', fee_name: 'Commission',
    seller_sku: 'รหัสของร้าน', lazada_sku: '123', details: 'ข้อความอิสระที่อาจมีชื่อคน', comment: 'คอมเมนต์',
  })
  const ls = JSON.stringify(lz)
  ok('Lazada ไม่เอา seller_sku/details/comment', !ls.includes('ข้อความอิสระ') && !ls.includes('คอมเมนต์') && !('seller_sku' in lz), ls)
}

console.log('② สามสถานะของตัวเลข — อ่านไม่ได้ ≠ ศูนย์')
{
  ok('ค่าว่าง ⇒ null', money('') === null && money(null) === null && money(undefined) === null)
  ok('อ่านไม่ออก ⇒ null (ไม่ใช่ 0)', money('ไม่ใช่เลข') === null)
  ok('ศูนย์จริง ⇒ 0', money('0') === 0 && money(0) === 0)
  ok('มีลูกน้ำ ⇒ อ่านได้', money('1,234.50') === 1234.5)
  const t = mapTiktok({ id: 5, settlement_amount: '', fee_amount: '0', revenue_amount: 'x' })
  ok('TikTok: ช่องว่าง ⇒ null · ศูนย์จริง ⇒ 0 · อ่านไม่ออก ⇒ null',
    t.settlement === null && t.fee === 0 && t.revenue === null, JSON.stringify(t))
}

console.log('③ วันต้องเป็นวันไทย')
{
  // 2026-09-17T18:30:00Z = 18 ก.ย. 01:30 เวลาไทย ⇒ ต้องได้ 2026-09-18
  ok('ข้ามวันแบบไทย', thaiDay(Date.UTC(2026, 8, 17, 18, 30) / 1000) === '2026-09-18', thaiDay(Date.UTC(2026, 8, 17, 18, 30) / 1000))
  ok('ยังเป็นวันเดิมเมื่อยังไม่ถึงเที่ยงคืนไทย', thaiDay(Date.UTC(2026, 8, 17, 10, 0) / 1000) === '2026-09-17')
  ok('ไม่มีเวลา ⇒ null', thaiDay(null) === null && thaiDay(0) === null && thaiDay('') === null)
}

console.log('④ หนึ่งเจ้าล้ม ห้ามลากอีกสองเจ้า + ต้องแยก skip จาก error')
{
  const r = await readMarketplaceFinance({ days: 3, limit: 2 }, {
    now: '2026-09-18T00:00:00Z',
    shopee: async () => ({ response: { transaction_list: [{ transaction_id: 1, amount: 10, create_time: 1757000000 }], more: true } }),
    lazada: async () => { throw new Error('ยังไม่ได้เชื่อมร้าน lazada') },
    tiktok: async () => { throw new Error('HTTP 403 access_token=abcdef ไม่มีสิทธิ์') },
  })
  const by = Object.fromEntries(r.results.map((x) => [x.platform, x]))
  ok('shopee สำเร็จ', by.shopee.ok === true && by.shopee.count === 1)
  ok('lazada = skip (ไม่ใช่ error)', Boolean(by.lazada.skip) && by.lazada.ok === undefined, JSON.stringify(by.lazada))
  ok('tiktok = error', by.tiktok.ok === false && Boolean(by.tiktok.error))
  ok('ซ่อน access_token ในข้อความ error', !by.tiktok.error.includes('abcdef'), by.tiktok.error)
  ok('truncated บอกว่ามีต่อ', by.shopee.truncated === true)
  ok('มี grain ทุกเจ้าที่สำเร็จ', by.shopee.grain === 'wallet-txn')
  ok('มีป้ายขอบเขต (scope) ติดมาด้วย', typeof by.shopee.scope === 'string' && by.shopee.scope.includes('Shopee'))
  ok('หมายเหตุเตือนห้ามบวกรวมข้ามเจ้า', r.note.includes('ห้ามบวกรวม'))
}

console.log('⑤ ชื่อช่องที่ต้นทางส่งมา — ส่งแต่ชื่อ ห้ามส่งค่า')
{
  const r = await readMarketplaceFinance({ days: 1, limit: 1 }, {
    now: '2026-09-18T00:00:00Z',
    shopee: async () => ({ response: { transaction_list: [{ transaction_id: 1, buyer_name: 'ชื่อผู้ซื้อจริง', amount: 5 }] } }),
    lazada: async () => ({ data: [] }),
    tiktok: async () => ({ data: { statements: [] } }),
  })
  const sp = r.results.find((x) => x.platform === 'shopee')
  ok('fieldsSeen มีชื่อช่อง buyer_name', sp.fieldsSeen.includes('buyer_name'), JSON.stringify(sp.fieldsSeen))
  ok('แต่ค่าของมันไม่หลุดออกมา', !JSON.stringify(sp).includes('ชื่อผู้ซื้อจริง'))
}

console.log('⑥ เลื่อนหน้า — สามเจ้าไม่เหมือนกัน ห้ามใช้เลขหน้ากับ TikTok')
{
  const seen = {}
  await readMarketplaceFinance({ days: 7, limit: 50, page: 3, pageToken: 'tok-abc' }, {
    now: '2026-09-18T00:00:00Z',
    shopee: async (_p, q) => { seen.shopee = q; return { response: { transaction_list: [] } } },
    lazada: async (_p, q) => { seen.lazada = q; return { data: [] } },
    tiktok: async (_p, o) => { seen.tiktok = o?.query; return { data: { statements: [], next_page_token: 'tok-next' } } },
  })
  ok('Shopee ใช้เลขหน้า (page_no = 3)', seen.shopee?.page_no === '3', JSON.stringify(seen.shopee))
  ok('Lazada ใช้จำนวนแถว (offset = 3 × 50 = 150)', seen.lazada?.offset === '150', JSON.stringify(seen.lazada))
  ok('TikTok ใช้โทเคน ไม่ใช่เลขหน้า', seen.tiktok?.page_token === 'tok-abc' && !('page_no' in (seen.tiktok || {})), JSON.stringify(seen.tiktok))

  const r2 = await readMarketplaceFinance({ days: 7, limit: 10 }, {
    now: '2026-09-18T00:00:00Z',
    shopee: async () => ({ response: { transaction_list: [] } }),
    lazada: async () => ({ data: [] }),
    tiktok: async () => ({ data: { statements: [], next_page_token: 'tok-next' } }),
  })
  const tk = r2.results.find((x) => x.platform === 'tiktok')
  ok('ส่ง nextPageToken กลับให้เลื่อนหน้าต่อได้', tk.nextPageToken === 'tok-next', JSON.stringify(tk.nextPageToken))
  ok('ไม่มีหน้าถัดไป ⇒ null ไม่ใช่ ""', (await readMarketplaceFinance({}, {
    now: '2026-09-18T00:00:00Z',
    shopee: async () => ({ response: { transaction_list: [] } }),
    lazada: async () => ({ data: [] }),
    tiktok: async () => ({ data: { statements: [] } }),
  })).results.find((x) => x.platform === 'tiktok').nextPageToken === null)
  ok('คำตอบบอกว่าเลขหน้าใช้กับใครได้', r2.pageApplies.includes('TikTok'))
}

console.log('⑦ ช่วงวันของ Shopee ต้องถูกหดให้ < 15 วันเอง (วัดจริง 18 ก.ย.: 14 วันได้ · 15 วันขึ้นไป Shopee ตอบ time_invalid)')
{
  const seen = {}
  const r = await readMarketplaceFinance({ days: 30, limit: 10 }, {
    now: '2026-09-18T00:00:00Z',
    shopee: async (_p, q) => { seen.shopee = q; return { response: { transaction_list: [{ transaction_id: 1 }] } } },
    lazada: async (_p, q) => { seen.lazada = q; return { data: [] } },
    tiktok: async () => ({ data: { statements: [] } }),
  })
  const sp = r.results.find((x) => x.platform === 'shopee')
  const span = (Number(seen.shopee.create_time_to) - Number(seen.shopee.create_time_from)) / 86400
  ok('ช่วงที่ส่งให้ Shopee < 15 วัน', span < 15 && span > 13, String(span))
  ok('ติดป้ายว่าหดช่วงแล้ว', sp.windowClamped === true && sp.windowDays === 14, JSON.stringify([sp.windowClamped, sp.windowDays]))
  ok('เขียนบอกในป้ายขอบเขตด้วย', sp.scope.includes('หดช่วง'), sp.scope)
  ok('Lazada ยังได้ช่วงเต็ม 30 วัน', seen.lazada.start_time === '2026-08-19' && seen.lazada.end_time === '2026-09-18',
    JSON.stringify([seen.lazada.start_time, seen.lazada.end_time]))
  ok('คำตอบบอกช่วงวันที่ใช้จริง', r.range?.from === '2026-08-19' && r.range?.to === '2026-09-18', JSON.stringify(r.range))

  // ขอ 7 วัน = ไม่ต้องหด ⇒ ห้ามติดป้ายว่าหด (ป้ายที่ติดทุกครั้งเท่ากับไม่มีป้าย)
  const r2 = await readMarketplaceFinance({ days: 7, limit: 10 }, {
    now: '2026-09-18T00:00:00Z',
    shopee: async () => ({ response: { transaction_list: [] } }),
    lazada: async () => ({ data: [] }), tiktok: async () => ({ data: { statements: [] } }),
  })
  const sp2 = r2.results.find((x) => x.platform === 'shopee')
  ok('7 วัน ⇒ ไม่ติดป้ายหดช่วง', sp2.windowClamped === false && !sp2.scope.includes('หดช่วง'))

  // to= เลื่อนหน้าต่างย้อนหลังได้
  const r3 = await readMarketplaceFinance({ days: 7, to: '2026-08-31' }, {
    now: '2026-09-18T00:00:00Z',
    shopee: async (_p, q) => { seen.shopee3 = q; return { response: { transaction_list: [] } } },
    lazada: async (_p, q) => { seen.lazada3 = q; return { data: [] } }, tiktok: async () => ({ data: { statements: [] } }),
  })
  ok('to= เลื่อนช่วงถอยหลังได้', r3.range?.to === '2026-08-31' && seen.lazada3.end_time === '2026-08-31', JSON.stringify(r3.range))
  ok('to= รูปแบบผิด ⇒ ใช้วันนี้ ไม่พังคำขอ', (await readMarketplaceFinance({ to: 'ไม่ใช่วันที่' }, {
    now: '2026-09-18T00:00:00Z',
    shopee: async () => ({ response: { transaction_list: [] } }),
    lazada: async () => ({ data: [] }), tiktok: async () => ({ data: { statements: [] } }),
  })).range?.to === '2026-09-18')
}

console.log(fail ? `\n🔴 ตก ${fail} ข้อ` : '\n✅ ผ่านหมด')
process.exit(fail ? 1 : 0)
