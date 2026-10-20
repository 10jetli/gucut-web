/* 🔀 ด่านของงาน "ปุ่มเรียงต้องเรียงจริง" (20 ต.ค. 2569)
 *
 * 🔴 เหตุที่ไฟล์นี้เกิด: รอบแรกผมเขียนตัวแปล `sort=` ลงใน `listBundles`/`listContacts` ครบ
 *    **เทสเขียว 8/8** แต่เทสเรียกตัวอ่านตรง ๆ ⇒ ไม่ผ่าน `netlify/functions/core.mjs`
 *    ซึ่ง **ไม่ได้ส่ง `sort`/`dir` ต่อเลย** ⇒ ของจริงยังเมิน sort เหมือนก่อนแก้ทุกประการ
 *    (คลาส [[test-must-hit-the-path]] · [[mock-cant-see-missing-dimension]])
 *    ⇒ ที่นี่จึงตรวจ **สองชั้นที่คนละหน้าที่ ห้ามยุบรวม**:
 *       ① เส้นทางส่งต่อใน core.mjs (อ่านซอร์ส — ชั้นเดียวที่จับ "ลืมส่งพารามิเตอร์")
 *       ② พฤติกรรมของตัวอ่าน (สวมฐาน แล้วดู ORDER BY ที่ออกมาจริง)
 */
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { readFileSync } from 'node:fs'

// ───────── ① เส้นทางส่งต่อ: core.mjs ต้องส่ง sort+dir ให้ตัวอ่านทุกตัวที่รองรับ ─────────
test('core.mjs ส่ง sort/dir ต่อให้ตัวอ่านทุกเส้นที่รองรับการเรียง', () => {
  const src = readFileSync(new URL('../../netlify/functions/core.mjs', import.meta.url), 'utf8')
  for (const ตัวอ่าน of ['listBundles', 'listContacts', 'listPurchases', 'listStock']) {
    const i = src.indexOf(`await ${ตัวอ่าน}({`)
    assert.ok(i > 0, `หาจุดเรียก ${ตัวอ่าน} ใน core.mjs ไม่เจอ`)
    /* ตัดเอาเฉพาะก้อนพารามิเตอร์ของจุดเรียกนั้น — ห้ามค้นทั้งไฟล์
       ไม่งั้นคำว่า sort ของเส้นอื่น (deadstock · stockcard) จะทำให้ผ่านฟรี */
    const ก้อน = src.slice(i, src.indexOf('})', i))
    /* ⚠️ **ห้ามตรึงชื่อตัวอ่าน query** — จุดเรียกในไฟล์นี้ใช้ทั้ง `url.searchParams.get(...)`
       และตัวย่อ `p.get(...)` ⇒ ตรึงรูปใดรูปหนึ่งได้ **แดงลวง** (เจอจริงตอนเพิ่ม listStock:
       ด่านฟ้องว่าไม่ส่ง dir ทั้งที่ส่งครบ ⇒ เกือบไปแก้โค้ดที่ยังดี)
       🔑 คำถามที่ด่านนี้ต้องถามคือ "พารามิเตอร์ถูกส่งต่อไหม" ไม่ใช่ "เขียนด้วยสำนวนไหน" */
    for (const ช่อง of ['sort', 'dir']) {
      assert.match(ก้อน, new RegExp(`${ช่อง}:\\s*[\\w.]*\\bget\\("${ช่อง}"\\)`),
        `${ตัวอ่าน}: core.mjs ไม่ได้ส่ง ${ช่อง} ต่อ ⇒ จอกดเรียงแล้วลำดับไม่ขยับ (ปุ่มหลอก)`)
    }
  }
})

// ───────── ② พฤติกรรม: list=stock ต้องมีตัวตัดสินสุดท้ายที่ไม่ซ้ำ ─────────
const เห็น = []
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql) => {
    const s = String(sql).replace(/\s+/g, ' ').trim()
    เห็น.push(s)
    if (s.includes('SELECT (SELECT day FROM d) AS day')) return [{
      day: '2026-10-20', skus: 1, out_of_stock: 0, low: 0, negative: 0, value: 1, value_cost: 1, no_cost: 0,
    }]
    if (s.includes('SELECT SUM(CASE WHEN COALESCE(p.product_type,0) = 1')) return [{ services: 0, inactive: 0 }]
    if (s.includes('SELECT cur.sku AS sku')) return [{ sku: 'A', name: 'ก', qty: 0, snapshot_qty: 0, price: 1,
      sold30: 0, buy: 1, avail: 0, category: '', unit: '', ptype: 0, active: 1, weight: null, imagePath: '', imageFile: null }]
    // ใบซื้อ: สรุป · แท็บสถานะ · แถว
    if (s.startsWith('SELECT COUNT(*) AS c, ROUND(')) return [{ c: 2, total: 3, 'มีค่า': 2, 'ว่างเปล่า': 0 }]
    if (s.includes('FROM purchase_orders_v2') && s.includes('GROUP BY status')) return [{ status: 'ปกติ', c: 2 }]
    if (s.includes('SELECT id, number, vendor, po_date')) return [{ id: '1', number: 'PO-1', vendor: 'ก', po_date: '2026-10-01', status: 'ปกติ', amount: 1, payment_status: '', warehouse: '' }]
    if (s.includes('FROM core_meta')) return [{ v: '2026-10-20 00:00:00' }]
    return []
  },
} })
mock.module('../../netlify/lib/core-freshness.mjs', { namedExports: {
  freshnessOf: async () => ({ syncedAtUtc: '2026-10-20 00:00:00', syncedAtKnown: true, changedAtUtc: '2026-10-20 00:00:00' }),
  markSync: async () => {},
  /* ⚠️ ตัวสวมต้องมี export ครบตามที่โมดูลจริงใช้ ไม่งั้นได้ SyntaxError ที่อ่านเหมือนโมดูลจริงขาด export */
  'รอบที่คาดหวัง': async () => ({ stockExpectedEveryHours: 24, stockExpectedCron: '13 * * * *', stockExpectedNote: '(ค่าสวม)' }),
} })
mock.module('../../netlify/lib/licensed-stock.mjs', { namedExports: { licensedStock: () => null } })

const { listStock } = await import('../../netlify/lib/core-stock.mjs')
const { listPurchases } = await import('../../netlify/lib/core-purchases.mjs')

const แถวSQL = (คำ) => เห็น.find((s) => s.includes(คำ)) || ''

test('list=stock: ทุกค่า sort ต้องปิดท้ายด้วยคอลัมน์ที่ไม่ซ้ำ ⇒ ไล่หน้าไม่ข้าม/ไม่ซ้ำแถว', async () => {
  for (const ค่า of ['qty', 'qtydesc', 'sold', 'name', 'price', 'pricelow', 'buy', 'available', 'availablelow']) {
    เห็น.length = 0
    await listStock({ sort: ค่า, limit: '5' })
    const sql = แถวSQL('SELECT cur.sku AS sku')
    const i = sql.indexOf('ORDER BY')
    assert.ok(i > 0, `sort=${ค่า}: ไม่เจอ ORDER BY`)
    assert.ok(sql.slice(i).includes('cur.sku ASC'),
      `sort=${ค่า}: ORDER BY ไม่มีตัวตัดสินสุดท้าย ⇒ แถวที่ค่าเท่ากันสลับที่เองได้ (${sql.slice(i, i + 70)})`)
  }
})

test('list=stock: sort=sku ต้องไม่ต่อ cur.sku ซ้ำสองครั้ง', async () => {
  เห็น.length = 0
  await listStock({ sort: 'sku', limit: '5' })
  const sql = แถวSQL('SELECT cur.sku AS sku')
  const ส่วนเรียง = sql.slice(sql.indexOf('ORDER BY'))
  assert.equal((ส่วนเรียง.match(/cur\.sku/g) || []).length, 1,
    `เรียงด้วย sku อยู่แล้วแต่ยังต่อท้ายซ้ำ: ${ส่วนเรียง.slice(0, 70)}`)
})

// ───────── ③ พฤติกรรม: list=purchases เพิ่งได้ sort= รอบนี้ ─────────
test('list=purchases: sort ไปถึง ORDER BY จริง และสะท้อนใน applied', async () => {
  เห็น.length = 0
  const r = await listPurchases({ sort: 'vendor', dir: 'desc' })
  const sql = แถวSQL('SELECT id, number, vendor, po_date')
  assert.ok(sql.includes('ORDER BY vendor DESC'), `ORDER BY ไม่ได้ใช้ค่าที่ส่งมา: ${sql.slice(sql.indexOf('ORDER BY'), sql.indexOf('ORDER BY') + 60)}`)
  assert.equal(r.applied.sort, 'vendor')
  assert.equal(r.applied.dir, 'desc')
  assert.equal(r.applied.sortDefaulted, false)
})

test('list=purchases: ไม่ส่ง sort ⇒ ได้ลำดับเดิมของเส้นนี้เป๊ะ (จอเก่าต้องไม่เห็นชุดใหม่)', async () => {
  เห็น.length = 0
  const r = await listPurchases({})
  const sql = แถวSQL('SELECT id, number, vendor, po_date')
  assert.ok(sql.includes('ORDER BY po_date DESC, number DESC'), `ลำดับตั้งต้นเปลี่ยนไป: ${sql.slice(sql.indexOf('ORDER BY'), sql.indexOf('ORDER BY') + 60)}`)
  assert.equal(r.applied.sortDefaulted, true)
  assert.equal(r.applied.sort, 'date')
})

test('list=purchases: เรียงแล้วต้องต่อท้ายด้วยลำดับตั้งต้น ⇒ ลำดับนิ่ง', async () => {
  เห็น.length = 0
  await listPurchases({ sort: 'status' })
  const sql = แถวSQL('SELECT id, number, vendor, po_date')
  assert.ok(sql.includes('ORDER BY status ASC, po_date DESC, number DESC'),
    `ไม่ได้ต่อท้ายลำดับตั้งต้น: ${sql.slice(sql.indexOf('ORDER BY'), sql.indexOf('ORDER BY') + 80)}`)
})

test('list=purchases: ชื่อช่องไม่รู้จัก / dir มั่ว ⇒ ตีกลับพร้อมรายชื่อ ไม่ใช่เมินเงียบ', async () => {
  const ผิดช่อง = await listPurchases({ sort: 'ไม่มีช่องนี้' })
  assert.match(String(ผิดช่อง.error), /ไม่รู้จักช่องเรียง/)
  for (const ช่อง of ['date', 'number', 'vendor', 'status', 'amount', 'payment', 'warehouse'])
    assert.ok(String(ผิดช่อง.error).includes(ช่อง), `ข้อความตีกลับไม่ได้บอกว่าเรียงได้ด้วย ${ช่อง}`)
  const ผิดทิศ = await listPurchases({ sort: 'vendor', dir: 'ขึ้น' })
  assert.match(String(ผิดทิศ.error), /dir ต้องเป็น asc หรือ desc/)
})

test('list=purchases: รับรูปย่อ sort=-amount (ขีดหน้า = ลง)', async () => {
  เห็น.length = 0
  const r = await listPurchases({ sort: '-amount' })
  assert.equal(r.applied.sort, 'amount')
  assert.equal(r.applied.dir, 'desc')
  assert.ok(แถวSQL('SELECT id, number, vendor, po_date').includes('ORDER BY amount DESC'))
})

// ───────── ④ list=stock รับการเรียงสองรูปพร้อมกัน (คุณส้มขอ 20 ต.ค. 2569 16:02) ─────────

/* 🧊 **ตรึงผลของชื่อเดิมทั้ง 10 ตัวไว้เป็นตัวหนังสือ** — ลอกมาจากตาราง SORTS ก่อนรีแฟคเตอร์
   🔑 นี่คือด่านที่สำคัญที่สุดของใบนี้: ตอนนี้ SORTS ถูก **คิด** จากสองตาราง ไม่ได้พิมพ์ไว้
      ⇒ ถ้าสูตรเพี้ยน ทิศของจอที่ deploy อยู่จะพลิกเงียบ ๆ โดย build ยังผ่าน
      (`sort=price` เดิมคือ **DESC** ไม่ใช่ asc — ตัวที่พลาดง่ายที่สุด) */
const ลำดับเดิมที่ตรึงไว้ = {
  qty: 'p.onhand ASC', qtydesc: 'p.onhand DESC', sold: 'sold30 DESC',
  sku: 'cur.sku ASC', name: 'name ASC', price: 'cur.price DESC', pricelow: 'cur.price ASC',
  buy: 'buy DESC', available: 'avail DESC', availablelow: 'avail ASC',
}

test('list=stock: ชื่อเดิมทั้ง 10 ตัว (ไม่ส่ง dir) ต้องให้ ORDER BY เดิมเป๊ะทุกตัวอักษร', async () => {
  for (const [ชื่อ, คาด] of Object.entries(ลำดับเดิมที่ตรึงไว้)) {
    เห็น.length = 0
    await listStock({ sort: ชื่อ, limit: '5' })
    const sql = แถวSQL('SELECT cur.sku AS sku')
    const ส่วนเรียง = sql.slice(sql.indexOf('ORDER BY') + 'ORDER BY '.length)
    const คาดเต็ม = คาด === 'cur.sku ASC' ? คาด : `${คาด}, cur.sku ASC`
    assert.ok(ส่วนเรียง.startsWith(คาดเต็ม),
      `sort=${ชื่อ} เปลี่ยนความหมายไป — คาด "${คาดเต็ม}" ได้ "${ส่วนเรียง.slice(0, 50)}"`)
  }
})

test('list=stock: รูปใหม่ sort+dir คุมทิศได้ และไม่แตะความหมายของชื่อเดิม', async () => {
  for (const [ช่อง, ทิศ, คาด] of [
    ['price', 'asc', 'cur.price ASC'], ['price', 'desc', 'cur.price DESC'],
    ['qty', 'desc', 'p.onhand DESC'], ['available', 'asc', 'avail ASC'],
    ['name', 'desc', 'name DESC'], ['sold', 'asc', 'sold30 ASC'], ['buy', 'asc', 'buy ASC'],
  ]) {
    เห็น.length = 0
    const r = await listStock({ sort: ช่อง, dir: ทิศ, limit: '5' })
    const sql = แถวSQL('SELECT cur.sku AS sku')
    assert.ok(sql.includes(`ORDER BY ${คาด}`), `sort=${ช่อง}&dir=${ทิศ}: คาด "${คาด}" ได้ "${sql.slice(sql.indexOf('ORDER BY'), sql.indexOf('ORDER BY') + 50)}"`)
    assert.equal(r.applied.dir, ทิศ)
    assert.equal(r.applied.sortDefaulted, false)
  }
})

test('list=stock: applied ต้องมี dir + sortDefaulted (จอเปิดปุ่มจากสองคีย์นี้)', async () => {
  const ไม่ส่ง = await listStock({ limit: '5' })
  assert.equal(ไม่ส่ง.applied.sortDefaulted, true, 'ไม่ส่ง sort ⇒ sortDefaulted ต้องเป็น true')
  assert.equal(ไม่ส่ง.applied.dir, 'asc', 'ลำดับตั้งต้นของเส้นนี้คือ onhand ASC')
  /* ⚠️ ชื่อเดิมที่หมายถึง desc ต้องรายงาน dir=desc ⇒ จอชี้ลูกศรถูกแม้ไม่ได้ส่ง dir มา */
  for (const [ชื่อ, ทิศ] of [['price', 'desc'], ['sold', 'desc'], ['buy', 'desc'],
                             ['available', 'desc'], ['qty', 'asc'], ['name', 'asc'],
                             ['pricelow', 'asc'], ['qtydesc', 'desc'], ['availablelow', 'asc']]) {
    const r = await listStock({ sort: ชื่อ, limit: '5' })
    assert.equal(r.applied.dir, ทิศ, `sort=${ชื่อ} ต้องรายงาน dir=${ทิศ}`)
    assert.equal(r.applied.sortDefaulted, false)
  }
})

test('list=stock: คำขอที่ขัดกันเอง/dir มั่ว ⇒ ตีกลับ ไม่ใช่เดาว่าฝ่ายไหนชนะ', async () => {
  const ขัดกัน = await listStock({ sort: 'qtydesc', dir: 'asc' })
  assert.match(String(ขัดกัน.error), /ฝังทิศไว้ในชื่อแล้ว/)
  assert.match(String(ขัดกัน.error), /sort=qty&dir=asc/, 'ต้องบอกรูปที่ถูกให้ด้วย ไม่ใช่แค่ปฏิเสธ')
  const ทิศมั่ว = await listStock({ sort: 'qty', dir: 'ขึ้น' })
  assert.match(String(ทิศมั่ว.error), /dir ต้องเป็น asc หรือ desc/)
})

test('list=stock: sort=sku&dir=desc ต้องไม่ได้ ORDER BY ที่ขัดกันเอง', async () => {
  เห็น.length = 0
  await listStock({ sort: 'sku', dir: 'desc', limit: '5' })
  const sql = แถวSQL('SELECT cur.sku AS sku')
  const ส่วนเรียง = sql.slice(sql.indexOf('ORDER BY'))
  assert.equal((ส่วนเรียง.match(/cur\.sku/g) || []).length, 1,
    `ได้ ORDER BY ที่ขัดกันเอง: ${ส่วนเรียง.slice(0, 60)}`)
})
