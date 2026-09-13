# ตรวจค่าขนส่งที่กระจกอาจค้าง ก่อนแก้ตัวซิงก์

เพิ่มการอ่านอย่างเดียวใน `GET /api/core?ordercheck=1` เทียบ shippingchannel,
shippingname, shippingdateString (fallback shippingdate) และ isCOD กับกระจก
ใช้รูปแบบตัดความยาว/แปลงค่าเดียวกับ core-sync โดยยังไม่แก้ same() และไม่ backfill

- `counts.shippingFields`: จำนวนต่างรายฟิลด์ shipChannel/shipName/shipDate/isCod
- `counts.staleShipping`: จำนวนใบต่างอย่างน้อยหนึ่งฟิลด์ นับครั้งเดียวต่อใบ
- `sample.staleShipping`: สูงสุด 15 ใบ ส่งเฉพาะ number และ fields ไม่มีชื่อผู้รับ
- เทียบเฉพาะร้านและช่วงเดียวกัน และเฉพาะใบที่พบทั้งสองฝั่ง
- `coverage` แสดงยอด count จาก ZORT, แถวที่อ่าน, ใบไม่ซ้ำ, จำนวนหน้า,
  countStable, matchedOrders และเวลาเริ่ม/จบการอ่าน
- `zortReadComplete=true` เมื่อ count ครบและคงที่ ไม่มีใบซ้ำ/ชนเพดาน;
  null คือไม่ประกาศ count; false คือพบหลักฐานไม่ครบหรือไม่คงที่
- ถ้าไม่ยืนยันครบ: ok=false, partial=true, extraInMirror=null และไม่ส่งตัวอย่าง extra
  ความต่างอื่นเป็นเพียงส่วนที่อ่านได้ ไม่ใช่คำรับรองทั้งหน้าต่าง
- HTTP ล้มเหลว/JSON ผิด/list หาย/เลขใบหาย/count ผิดชนิด ทำให้เทียบไม่สำเร็จ

การเปลี่ยน contract: from/to ต้องส่งคู่กันเป็นวันจริงและช่วงไม่เกิน 31 วันรวมปลายทั้งสอง;
days เป็นจำนวนเต็ม 1–31 และนับรวมวันนี้ตามเวลาไทย (เดิม days=14 กิน 15 วัน)
store ที่ผิดคืน 400 แทน fallback เป็น z1; ไม่มี store ยังใช้ z1 เหมือนเดิม
การอ่านหลายหน้าและสองระบบไม่ใช่ snapshot เดียว แม้ยอดคงที่ก็ยังมีข้อมูลเปลี่ยนระหว่างอ่านได้

## ผู้รีวิวทดสอบของจริง

หลังนำ commit ไปใช้ในสภาพแวดล้อมที่ได้รับอนุญาตแล้ว ให้ผู้รีวิวตั้ง CHAT_ADMIN_KEY
ใน environment ตามวิธีเดิม และรันทีละร้าน/ทีละเดือน (สคริปต์ใช้ GET อย่างเดียว):

```bash
node scripts/check-ordercheck-shipping.mjs https://gucut.com z1 2026-09-01 2026-09-12
node scripts/check-ordercheck-shipping.mjs https://gucut.com z2 2026-09-01 2026-09-12
```

เก็บผลพร้อม x-core-build, window, coverage และ counts ก่อนแก้ same()
สคริปต์คืน exit 2 เมื่อ partial และปฏิเสธ payload เก่าที่ไม่มีตัวเทียบสี่ฟิลด์
Codex ไม่ได้ใช้คีย์หรือรันสคริปต์นี้กับระบบจริง จึงยังไม่มีจำนวน drift จริง
ช่วงเก่าให้เลือกเพิ่มตามข้อสงสัย; ผลเดือนเดียวไม่รับรองประวัติทั้งหมด

ทดสอบ local: `node scripts/tests/ordercheck-shipping.test.mjs` รันบล็อก route จริงด้วย I/O จำลอง
ครอบคลุม union, privacy, ร้าน/วันที่, schema, total เปลี่ยน, ใบซ้ำ, count หาย และเพดาน 10 หน้า

บันทึกสถานะ ณ 13 Sep 2026: ตัวเทียบสี่ฟิลด์ (ordercheck-shipping) deploy ขึ้น production แล้ว
เมื่อ 2026-09-13 08:11 ICT (x-core-build 2026-09-13T01:11:29Z) · จำนวน drift จริงยังไม่ถูกนับ
รอผู้รีวิวรัน scripts/check-ordercheck-shipping.mjs ด้วยคีย์หลังร้าน · เขียนจาก g1 เป็นงานพิสูจน์การย้ายเครื่อง
