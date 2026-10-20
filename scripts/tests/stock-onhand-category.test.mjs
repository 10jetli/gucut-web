/* จอคลัง ZORT แยก stock/onhand จาก availablestock จริง และโชว์หมวดใต้ชื่อ
 * ปัญหาเดิม: list=stock คืน snapshot qty กับ available ค่าเดียวกัน ทำให้จอเขียนเลขผิดสองช่อง */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const raw = readFileSync('netlify/lib/core-stock.mjs', 'utf8')
const body = raw.slice(raw.indexOf('export async function listStock'), raw.indexOf('export async function stockReconLog'))
const src = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

test('qty ของ list=stock มาจาก products.onhand ไม่ใช่ snapshot qty หรือ available', () => {
  assert.match(src, /SELECT cur\.sku AS sku, p\.onhand AS qty, cur\.qty AS snapshot_qty/)
  assert.match(src, /qty:\s*r\.qty === null \|\| r\.qty === undefined \? null : num\(r\.qty\)/)
  assert.match(src, /available:\s*r\.avail === null \|\| r\.avail === undefined \? null : num\(r\.avail\)/)
  assert.match(src, /out:\s*"p\.onhand <= 0"/)
  /* ⚠️ 20 ต.ค. 2569 — ตาราง SORTS ถูกเปลี่ยนเป็น "คิดจาก `ช่องเรียง` + ทิศ" (รับ sort+dir)
     ⇒ ตัวหนังสือ `qty: "p.onhand ASC"` ไม่มีอยู่แล้ว **แต่คำถามของด่านนี้ไม่เปลี่ยน**:
       "ค่าเรียง qty ต้องชี้ที่ products.onhand ไม่ใช่ snapshot qty หรือ available"
     🔑 ยอมรับทั้งสองรูป (มี/ไม่มีทิศต่อท้าย) ⇒ ด่านไม่พังอีกถ้าใครเติมทิศกลับ
     📎 ทิศของทุกชื่อถูกตรึงเป็นค่าจริงไว้ที่ `scripts/tests/ส่งต่อการเรียง.test.mjs`
        (ด่านนี้อ่านซอร์ส · ใบนั้นวัดพฤติกรรม — คนละหน้าที่ ห้ามยุบรวม) */
  assert.match(src, /qty:\s*"p\.onhand(\s+ASC)?"/)
})

test('แถวส่ง category ชื่อตรงตัวจาก products และไม่เดาจากชื่อสินค้า', () => {
  assert.match(src, /p\.category AS category/)
  assert.match(src, /category:\s*r\.category === null \|\| r\.category === undefined \? null : String\(r\.category\)/)
  assert.match(src, /applied:\s*\{[\s\S]*category:\s*category \|\| null/)
})

test('ความสดของคงเหลืออิง products และแยกจากวัน snapshot', () => {
  assert.match(src, /freshnessOf\(coreQuery, \{ table: "products", metaKey: "sync_products" \}\)/)
  assert.match(src, /snapshotFreshness/)
  assert.match(src, /qty:\s*"products\.onhand"/)
  assert.match(src, /available:\s*"products\.available"/)
  assert.match(src, /category:\s*"products\.category"/)
})

test('ค้นรหัส/ชื่อแยกและช่วงราคาทำใน SQL ก่อนแบ่งหน้า', () => {
  assert.match(src, /contains\("cur\.sku"\)/)
  assert.match(src, /contains\("p\.name"\)/)
  assert.match(src, /cur\.price >= \?/)
  assert.match(src, /cur\.price <= \?/)
  assert.match(src, /p\.purchase_price >= \?/)
  assert.match(src, /p\.purchase_price <= \?/)
  assert.match(src, /advancedFiltersUnavailable/)
})
