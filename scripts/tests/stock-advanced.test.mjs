import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const seen = []
mock.module('../../netlify/lib/coredb.mjs', { namedExports: {
  coreReady: () => true,
  coreQuery: async (sql, params = []) => {
    const s = String(sql).replace(/\s+/g, ' ').trim()
    seen.push({ s, params })
    if (s.includes('SELECT (SELECT day FROM d) AS day')) return [{
      day: '2026-10-15', skus: 1, out_of_stock: 0, low: 0, negative: 0,
      value: 100, value_cost: 60, no_cost: 0,
    }]
    if (s.includes('SELECT SUM(CASE WHEN COALESCE(p.product_type,0) = 1')) return [{ services: 0, inactive: 0 }]
    if (s.includes('SELECT cur.sku AS sku')) return [{
      sku: 'ABC', name: 'สินค้า ABC', qty: 2, snapshot_qty: 2, price: 50,
      sold30: 1, buy: 30, avail: 1, category: 'ทดสอบ', unit: 'ชิ้น',
      ptype: 0, active: 1, weight: null, imagePath: '', imageFile: null,
    }]
    return []
  },
} })
mock.module('../../netlify/lib/core-freshness.mjs', { namedExports: {
  freshnessOf: async () => ({ syncedAtUtc: '2026-10-15 12:00:00', syncedAtKnown: true, changedAtUtc: '2026-10-15 12:00:00' }),
} })
mock.module('../../netlify/lib/licensed-stock.mjs', { namedExports: { licensedStock: () => null } })

const { listStock } = await import('../../netlify/lib/core-stock.mjs')

test('ตัวกรองขั้นสูงคลังกรองในทุก SQL ก่อนแบ่งหน้าและสะท้อนค่าที่ใช้จริง', async () => {
  seen.length = 0
  const r = await listStock({
    code: 'ABC', name: 'สินค้า', sellMin: '0', sellMax: '100',
    buyMin: '0', buyMax: '60', kind: 'all', limit: '50', offset: '0',
  })
  assert.equal(r.rows.length, 1)
  assert.deepEqual(
    { code: r.applied.code, name: r.applied.name, sellMin: r.applied.sellMin, sellMax: r.applied.sellMax,
      buyMin: r.applied.buyMin, buyMax: r.applied.buyMax, kind: r.applied.kind },
    { code: 'ABC', name: 'สินค้า', sellMin: 0, sellMax: 100, buyMin: 0, buyMax: 60, kind: 'all' },
  )
  const dataQueries = seen.filter((x) => x.s.includes('WITH d AS'))
  assert.equal(dataQueries.length, 3)
  for (const x of dataQueries) {
    assert.match(x.s, /instr\(lower\(cur\.sku\), lower\(\?\)\) > 0/)
    assert.match(x.s, /instr\(lower\(p\.name\), lower\(\?\)\) > 0/)
    assert.match(x.s, /cur\.price >= \? AND cur\.price <= \?/)
    assert.match(x.s, /p\.purchase_price >= \? AND p\.purchase_price <= \?/)
    assert.deepEqual(x.params.slice(-6), ['ABC', 'สินค้า', 0, 100, 0, 60])
  }
})

test('ช่องที่ไม่มีข้อมูลจริงตีกลับ ไม่คืนกองว่างเหมือนกรองสำเร็จ', async () => {
  assert.match((await listStock({ warehouse: 'KLD' })).error, /ไม่มียอดสต็อกรายคลัง/)
  assert.match((await listStock({ tag: 'ขายดี' })).error, /ยังไม่เก็บ Tag/)
  assert.match((await listStock({ archived: '1' })).error, /ไม่เก็บสินค้าที่ถูกลบ/)
})
