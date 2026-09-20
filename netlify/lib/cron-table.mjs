// ⚠️ ไฟล์นี้ถูกสร้างอัตโนมัติโดย scripts/gen-cron-table.mjs — ห้ามแก้มือ
// ค่า cron มาจาก `export const config` ของไฟล์ฟังก์ชันจริง (แหล่งเดียว)
export const generatedAt = "2026-09-20T02:18:05.196Z";
export const source = "netlify/functions/*.mjs (export const config)";
export const jobs = [
 {
  "id": "backup-run",
  "file": "netlify/functions/backup-run.mjs",
  "cron": "40 */6 * * *",
  "desc": "สำรองข้อมูลอัตโนมัติ — **ทุก 6 ชั่วโมง นาทีที่ 40 (UTC)** = 03:40 · 09:40 · 15:40 · 21:40 เวลาไทย",
  "timing": true
 },
 {
  "id": "beam-sweep",
  "file": "netlify/functions/beam-sweep.mjs",
  "cron": "*/30 * * * *",
  "desc": "กวาดออเดอร์ Beam ค้างจ่าย — ฟังก์ชันตามเวลา รันเองทุกครึ่งชั่วโมง",
  "timing": true
 },
 {
  "id": "bundle-recipe-sync",
  "file": "netlify/functions/bundle-recipe-sync.mjs",
  "cron": "0 3 * * *",
  "desc": "**สูตร**สินค้าเป็นชุด ZORT → คลังเงา — งานตามเวลาวันละครั้ง 03:00 UTC (10:00 ไทย)",
  "timing": false
 },
 {
  "id": "bundle-stock-sync",
  "file": "netlify/functions/bundle-stock-sync.mjs",
  "cron": "33 * * * *",
  "desc": "สต็อก/ราคาของสินค้าเป็นชุด ZORT → คลังเงา — **งานตามเวลาชั่วโมงละครั้ง (นาทีที่ 33)**",
  "timing": true
 },
 {
  "id": "contacts-sync",
  "file": "netlify/functions/contacts-sync.mjs",
  "cron": "19 * * * *",
  "desc": "ผู้ติดต่อ ZORT → คลังเงา contacts — งานตามเวลาทุกชั่วโมง (งานกระดาน t_mu2045bl · 15 ก.ย. 2569)",
  "timing": true
 },
 {
  "id": "core-sync",
  "file": "netlify/functions/core-sync.mjs",
  "cron": "13 * * * *",
  "desc": "คลังเงา GUCUT Core — งานตามเวลา **รันเองชั่วโมงละครั้ง (นาทีที่ 13)**",
  "timing": true
 },
 {
  "id": "credit-sample",
  "file": "netlify/functions/credit-sample.mjs",
  "cron": "53 * * * *",
  "desc": "เก็บตัวอย่างยอดใช้เครดิต Netlify ลงประวัติ — **งานตามเวลาชั่วโมงละครั้ง (นาทีที่ 53)**",
  "timing": true
 },
 {
  "id": "live-sweep",
  "file": "netlify/functions/live-sweep.mjs",
  "cron": "0 19 * * *",
  "desc": "เก็บกวาดข้อมูลคนเข้าเว็บที่หมดอายุ — งานตามเวลา ตี 2 ทุกคืน",
  "timing": false
 },
 {
  "id": "mkp-fees-sync",
  "file": "netlify/functions/mkp-fees-sync.mjs",
  "cron": "47 * * * *",
  "desc": "กระจกค่าธรรมเนียม Shopee (escrow รายใบ) → ตาราง shopee_fees — งานตามเวลาทุกชั่วโมง",
  "timing": true
 },
 {
  "id": "permit-remind",
  "file": "netlify/functions/permit-remind.mjs",
  "cron": "30 2 * * *",
  "desc": "ตามเตือนลูกค้าเรื่องขอทะเบียน — ฟังก์ชันตามเวลา รันเองวันละครั้ง",
  "timing": false
 },
 {
  "id": "returns-sync",
  "file": "netlify/functions/returns-sync.mjs",
  "cron": "7 */3 * * *",
  "desc": "ใบคืนสินค้า (ลูกค้าคืน · ReturnOrder) ZORT → คลังเงา return_orders_v2 (กุญแจ id) — งานตามเวลา **ทุก 3 ชั่วโมง** (ลดจากทุกชั่วโมง 18 ก.ย. 2569 · เหตุผลอยู่ท้ายไฟ",
  "timing": true
 },
 {
  "id": "shopee-reviews-pull",
  "file": "netlify/functions/shopee-reviews-pull.mjs",
  "cron": "20 17 * * *",
  "desc": "งานตามเวลา: ดึงรีวิว Shopee ผ่าน API ทุกคืน 00:20 ไทย (17:20 UTC)",
  "timing": false
 },
 {
  "id": "slips-sync",
  "file": "netlify/functions/slips-sync.mjs",
  "cron": "50 * * * *",
  "desc": "สลิปใหม่จาก ZORT → ถังปิด gucut-zort-slips ทีละ ≤8 ใบต่อชั่วโมง (ร้าน z1) — ใบกระดาน t_mu2sow9d · ดู netlify/lib/slip-scan.mjs",
  "timing": true
 },
 {
  "id": "stock-push-sweep-shopee",
  "file": "netlify/functions/stock-push-sweep-shopee.mjs",
  "cron": "5,20,35,50 * * * *",
  "desc": "ปลุกตัวกวาดดันสต็อก **shopee** ตามเวลา — เพิ่ม 17 ก.ย. 2569 (gucut2 · ท่านประธานสั่ง \"ทำให้ครบ\")",
  "timing": false
 },
 {
  "id": "stock-push-sweep-tiktok",
  "file": "netlify/functions/stock-push-sweep-tiktok.mjs",
  "cron": "10,25,40,55 * * * *",
  "desc": "ปลุกตัวกวาดดันสต็อก **tiktok** ตามเวลา — เพิ่ม 17 ก.ย. 2569 (gucut2 · ท่านประธานสั่ง \"ทำให้ครบ\")",
  "timing": false
 },
 {
  "id": "stock-push-sweep",
  "file": "netlify/functions/stock-push-sweep.mjs",
  "cron": "*/15 * * * *",
  "desc": "ปลุกตัวกวาดดันสต็อกตามเวลา — ท่านประธานสั่ง 17 ก.ย. 2569 \"อยากให้มันออโต้ อัปเดตเอง\"",
  "timing": false
 },
 {
  "id": "token-refresh",
  "file": "netlify/functions/token-refresh.mjs",
  "cron": "30 20 * * *",
  "desc": "ต่ออายุ token ของมาร์เก็ตเพลสให้เอง — วันละครั้ง",
  "timing": false
 }
];
