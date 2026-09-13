# ผลนับฟิลด์ขนส่งก่อนแก้ `same()`

งาน `t_mtxpye3a` · รันด้วยตัวตรวจ production ที่มีอยู่แล้ว `GET /api/core?ordercheck=1` · ผลรับเมื่อ 2026-09-13 20:54 UTC

ตัวตรวจอ่าน ZORT สดและกระจก D1 แยกกัน จึงนับเฉพาะหน้าต่างที่ระบุ ผลทั้งสองร้าน `ok: true`, `partial: false`, `truncated: false`, `zortReadComplete: true`; จึงใช้เป็นหลักฐานของช่วงนี้ได้ ไม่ใช่คำรับรองประวัติทุกวันนอกช่วง

| ร้าน | x-core-build | ช่วง | ZORT / กระจก / matched | staleShipping | shipChannel | shipName | shipDate | isCod |
|---|---|---|---:|---:|---:|---:|---:|---:|
| z1 | 2026-09-13T15:32:20.634Z | 2026-09-01 ถึง 2026-09-12 | 288 / 288 / 288 | 0 | 0 | 0 | 0 | 0 |
| z2 | 2026-09-13T15:32:20.634Z | 2026-09-01 ถึง 2026-09-12 | 116 / 116 / 116 | 0 | 0 | 0 | 0 | 0 |

รายละเอียด coverage: z1 อ่าน 2 หน้า, z2 อ่าน 1 หน้า; declaredTotal, rowsFetched และ uniqueOrders ตรงกันในแต่ละร้าน, countStable=true, missingInMirror/extraInMirror/staleStatus/stalePay/staleInteg เป็น 0 ทั้งหมด

การนับนี้เกิดบน production ก่อน merge กิ่ง `codex/shipping-same` (`ab81d52`) ซึ่งเพิ่มสี่คอลัมน์ลงใน `prev` และ `same()` เพื่อให้การเปลี่ยนภายหลังของ `ship_channel`, `ship_name`, `ship_date`, `is_cod` เข้ากอง write ได้ แม้ฟิลด์หัวใบอื่นนิ่งอยู่
