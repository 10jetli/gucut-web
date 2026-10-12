#!/usr/bin/env node
/* คัดรายชื่อรุ่นอะไหล่จาก src/lib/parts.ts → public/parts/models.json  (13 ต.ค. 2569)
 *
 * 🔴 ปัญหาที่แก้: รายชื่อรุ่นถูกพิมพ์ไว้ **สองที่คนละรีโป**
 *    · ที่นี่ (หน้าร้าน) · และ `รุ่นที่รองรับ` ใน gucut-next/app/api/parts-oem-sync/route.ts
 *    ลืมอีกฝั่ง ⇒ หน้าอะไหล่ของรุ่นใหม่เปิดได้ ของครบ แต่ไม่จับคู่กับของในร้านเลยสักชิ้น
 *    ⇒ ทุกแถวขึ้น "สอบถามร้าน" ทั้งที่ของมีขาย · **ไม่มี error ไม่มีอะไรฟ้อง**
 * ⇒ ให้ฝั่งที่มีไฟล์จริงประกาศออกไปทางเน็ต (/parts/models.json) แล้วอีกฝั่ง **ถามเอา**
 *
 * 🔑 ทำไมไม่ให้ parts.ts `import` ไฟล์ json ตรง ๆ (ลองแล้ว ถอยออกมา):
 *    เทส `อะไหล่-สี่สถานะกับยอดรวม` คอมไพล์ parts.ts ด้วย tsc เดี่ยว ๆ ⇒ import json ทำให้มันล้ม
 *    ⇒ แปลว่า "แหล่งเดียว" ที่ปลอดภัยที่สุดคือโค้ด แล้ว **คัดออกไปเป็นข้อมูล** ตอน build
 */
import { readFileSync, writeFileSync } from 'node:fs'

const ที่มา = 'src/lib/parts.ts'
const ปลายทาง = 'public/parts/models.json'
const src = readFileSync(ที่มา, 'utf8')

const ก้อน = src.match(/export const PARTS_MODELS: PartsModel\[\] = \[([\s\S]*?)\n\];/)
if (!ก้อน) {
  console.error(`🔴 gen-parts-models: หา PARTS_MODELS ใน ${ที่มา} ไม่เจอ — มีคนย้าย/เปลี่ยนรูปแบบ`)
  console.error('   ⇒ ไม่เขียนทับไฟล์เดิม (ของเก่าดีกว่าของว่าง) · แก้ตัวคัดให้ตรงรูปแบบใหม่ก่อน')
  process.exit(1)
}
const รุ่น = [...ก้อน[1].matchAll(/\{\s*slug:\s*"([^"]+)",\s*ชื่อ:\s*"([^"]+)",\s*คำค้นร้าน:\s*"([^"]+)"\s*\}/g)]
  .map(([, slug, ชื่อ, คำค้นร้าน]) => ({ slug, ชื่อ, คำค้นร้าน }))

/* 🔑 นับให้ตรงกับจำนวนแถวที่เห็นในก้อน — ไม่งั้น regex ที่กินไม่หมดจะเงียบ
   (แถวที่รูปแบบเพี้ยนจะหายไปเฉย ๆ แล้วรุ่นนั้นจะ "ไม่มีอยู่จริง" สำหรับหลังร้าน) */
const แถวที่เห็น = (ก้อน[1].match(/\{\s*slug:/g) || []).length
if (รุ่น.length !== แถวที่เห็น) {
  console.error(`🔴 gen-parts-models: อ่านได้ ${รุ่น.length} แถว แต่ในก้อนมี ${แถวที่เห็น} แถว`)
  console.error('   ⇒ มีแถวที่เขียนคนละรูปแบบ · ไม่เขียนไฟล์ ⇒ แก้ให้ครบก่อน')
  process.exit(1)
}
if (รุ่น.length < 6) { console.error('🔴 gen-parts-models: รุ่นน้อยผิดปกติ ⇒ ไม่เขียน'); process.exit(1) }

const ออก = JSON.stringify({
  'ℹ️ ที่มา': `สร้างจาก ${ที่มา} ด้วย scripts/gen-parts-models.mjs — ห้ามแก้ไฟล์นี้ด้วยมือ`,
  รุ่น,
}, null, 1) + '\n'
const เดิม = (() => { try { return readFileSync(ปลายทาง, 'utf8') } catch { return '' } })()
if (เดิม !== ออก) {
  writeFileSync(ปลายทาง, ออก)
  console.log(`📝 gen-parts-models: เขียน ${ปลายทาง} (${รุ่น.length} รุ่น)`)
} else {
  console.log(`✓ gen-parts-models: ${รุ่น.length} รุ่น ตรงกับไฟล์เดิม`)
}
