# bycustomer CPU — หลักฐานและขั้นตรวจรับ (11 ก.ย. 2569)

ส่งถึง **gucut (CEO)** · branch `codex/bycustomer-cpu` · ฐาน `445a1a5`

สถานะ: แพตช์และ regression ในเครื่องผ่าน **ยังไม่ได้ยืนยันบน D1 จริง** และยังไม่ผ่าน
เกณฑ์รับงาน production `days=90` สำเร็จ 3/3 รอบ แต่ละรอบต่ำกว่า ~15 วินาที
Codex ไม่ใช้คีย์หลังร้าน ไม่ยิง API จริง ไม่ push/deploy

## EXPLAIN ก่อนแก้ ไม่เริ่มจากการบังคับ index

ก่อนแก้ `netlify/functions/core.mjs` รัน SQL ที่ดึงจาก route เดิมตรง ๆ กับ orders schema/index
จาก `coredb.mjs` ในฐาน SQLite หน่วยความจำ ต่อมารันซ้ำบน fixture 601 ชื่อหลัง `ANALYZE`
ผลนี้เป็นแผน **SQLite 3.53.4 ในเครื่อง ไม่ใช่แผน D1 production**:

| ส่วน | ก่อนแก้ | หลังแก้ |
|---|---|---|
| ยอด/ช่องทาง | `SEARCH orders USING INDEX idx_orders_date (order_date>? AND order_date<?)` + temp GROUP BY | ไม่เปลี่ยน |
| firstDay | `SCAN orders` + temp GROUP BY ต่อก้อน 50 ชื่อ (limit=500 ถึง 10 รอบ) | สแกนครั้งเดียว + `LIST SUBQUERY` อ่าน JSON ชื่อ |
| monthly | 2 `CORRELATED SCALAR SUBQUERY` → `SEARCH f USING INDEX idx_orders_date` ไม่มีเงื่อนไข seek ชื่อ | `MATERIALIZE f` ครั้งเดียว → `SEARCH f USING AUTOMATIC COVERING INDEX (name=?) LEFT-JOIN` |
| historyFrom | MIN ผ่าน covering date index | ไม่เปลี่ยน |

ข้อสรุปจำกัดเฉพาะหลักฐานนี้: คิวรีหลักไม่ได้เลือก customer index ผิด แต่ MIN ใน monthly
ค้นประวัติซ้ำรายออเดอร์ และ `TRIM(customer)` ใน firstDay ไม่ได้ seek ด้วย raw customer index
ตามที่คอมเมนต์ 9 ก.ย. เคยคาดไว้ แก้คอมเมนต์ที่กล่าวอ้างนั้นด้วย
แผนหลังแก้ยืนยันซ้ำด้วย system SQLite 3.43.2 ทั้ง JSON subquery และ indexed LEFT JOIN แล้ว
ยังเหลือ full history scan/group แบบ set-based ไม่ได้อ้างว่าเลิกอ่านประวัติทั้งหมด

เหตุผลเชิงกลไกดู [SQLite EXPLAIN QUERY PLAN](https://www.sqlite.org/eqp.html)
และ [expression indexes](https://www.sqlite.org/expridx.html)
ส่วน JSON array เป็น bind เดียวใช้ `json_each(?)` ที่
[D1 รองรับโดยตรง](https://developers.cloudflare.com/d1/sql-api/query-json/)
ไม่มี SQL interpolation จากชื่อลูกค้า และไม่เพิ่ม column/index/migration/backfill

## สิ่งที่คงเดิม

- customer/channel grouping, ยอดรวม, scope, limit/truncated และลำดับคำตอบ ไม่เปลี่ยน
- firstDay ใช้ทั้งประวัติของร้านที่เลือก ตัด cancel/void/ยกเลิกเหมือนเดิม
- monthly นับทุกชื่อ ไม่ใช่แค่ top limit; ชื่อว่างนับเป็นจำนวนใบแยกกอง
- TRIM ใช้ SQLite เหมือนเดิม (ไม่ใช้ JS trim ซึ่งจะเปลี่ยนความหมายชื่อที่เป็น tab)
- monthly ล้มยังคืน `{error}` ไม่แกล้งเป็น `[]`; firstDay ล้มยังโยน error;
  historyFrom ล้มยังเป็น null; ไม่เปลี่ยน `ok`/`note`/`skip` และไม่เพิ่ม `fallthrough`
- จำนวน query ของ bycustomer ที่มีชื่อ ลดจากสูงสุด 13 เหลือ 4 ที่ limit=500;
  bind สูงสุด 4 ตัวเมื่อกรองร้าน ไม่โตตามจำนวนชื่อ

## ทดสอบในเครื่อง

```bash
node scripts/test-bycustomer-cpu.mjs
node scripts/test-bycustomer-cpu.mjs --explain
node scripts/test-bycustomer-cpu.mjs --bench
node --check netlify/functions/core.mjs
node --check scripts/test-bycustomer-cpu.mjs
node scripts/check-floating.mjs
npm --ignore-scripts run build
node scripts/check-leaks.mjs
git diff --check
```

ใช้ Node 26.8.1 / `node:sqlite` โดยไม่ติดตั้ง dependency ใหม่ ตัวทดสอบรัน daily/bycustomer
block จริงผ่าน injected SQLite query เทียบ JSON ทุกฟิลด์กับซอร์สฐาน `445a1a5`
ไม่ import coredb ที่ใช้คีย์ และบล็อก fetch; ไม่ครอบ auth/HTTP/D1/network layer
ต้องมี commit ฐานนี้อยู่ใน git history เพื่อรัน oracle

ผล: 106 comparisons สำหรับข้อมูลว่าง/edge × วัน/ร้าน/limit, 3 เคสเกิน 500 ชื่อ,
blank-only, error contracts, query/bind budget ผ่านหมด ครอบคลุมหลายเดือน/หลายร้าน,
ชื่อเว้นวรรค/null/tab/quote/backslash/JSON/ข้อความคล้าย SQL, ชื่อจริงที่คล้ายป้ายไม่ระบุ,
วันที่ก่อนช่วง/ขอบช่วง/หลังช่วง/ว่าง/null, จำนวนเงินทศนิยม/ติดลบ และคำตอบ daily เดิม
ลองทำ cancellation predicate เสียในหน่วยความจำแล้วตาข่ายจับความต่างได้จริง

Synthetic benchmark: 58,702 ใบ (57,002 ประวัติเก่า + 1,700 ใบในช่วง มี 1,036 ชื่อ)
`days=90&limit=500`; JSON ก่อน/หลังตรงกันทั้ง 6 รอบ:

| รอบ | ก่อน (ms) | หลัง (ms) |
|---|---:|---:|
| 1 | 55,673.9 | 129.4 |
| 2 | 78,506.5 | 122.1 |
| 3 | 53,382.8 | 128.1 |

monthly เดิมกิน ~53–78 วินาทีใน fixture นี้ หลัง ~84–88 ms; ตัวเลขนี้ **ไม่ใช่ latency D1**
ชุดข้อมูลตั้งใจให้ลูกค้าในช่วงเพิ่งมีประวัติ จึงเปิดเผยต้นทุน correlated MIN ได้ชัด
ช่วงวัดมี build/งานอื่นในเครื่องร่วมด้วย ไม่ใช้ ratio นี้รับรองความเร็ว production

build ผ่าน 2,870 หน้า; check-floating, node --check, check-leaks (5,841 ไฟล์), diff-check ผ่าน
**ไม่ได้รัน lifecycle เต็มของ `npm run build`**: ใช้ `--ignore-scripts` เพราะ prebuild
มี `gen-reviews.mjs` ลบ `public/rv/` และ merge-pending-reviews อาจใช้ backend;
postbuild มี POST ไป IndexNow ซึ่งไม่อยู่ในงานนี้ รัน check-floating/check-leaks แยกแทน
ไม่แตะ reviews.json หรือชุดรูป/รีวิวที่ห้ามลบ และไม่แก้ package.json เพื่อหลบด่าน

## ตรวจรับจริงโดย gucut ตามสิทธิ์เดิม

1. เก็บ EXPLAIN บน D1 จริงก่อน–หลังสำหรับ main grouping, firstDay, monthly
   ใช้ SQL จาก `--explain`/diff และ bind วันที่/ร้านให้ตรง เลือกข้อมูลเดียวกัน;
   ดูว่าหลังแก้มี materialization + name lookup และไม่มี correlated MIN ต่อใบ
   ไม่มี debug endpoint ใน commit นี้
2. ใช้เครื่องวัด **เดิม** ที่ `~/gucut-next/scripts/measure-core.mjs`:
   `node scripts/measure-core.mjs` จาก repo gucut-next โดยชี้ `GUCUT_WEB_BASE`
   ไป instance ที่รัน branch นี้และชุดข้อมูลเดียวกัน (gucut จัดการคีย์เอง)
   ไม่วัด main เก่าแล้วถือว่าเป็นผลแพตช์ และไม่ต้องสร้างตัววัด HTTP อีกตัว
3. ค่าเริ่มต้นครอบ days=90/30 × limit=500/100 × 3 รอบ;
   เสริม `bycustomer=1&days=7&limit=100`, `store=z1`, `store=z2` และ daily control
4. ตรวจ HTTP, x-core-build, จำนวนแถวและยอด/ขอบเขตจริงเทียบก่อน–หลัง
   **ตรวจว่า monthly เป็น array ไม่มี monthly.error ด้วย**: เครื่องวัดเดิมจับ body.error
   ระดับบน แต่ nested monthly.error อาจยังขึ้นว่าสำเร็จ 3/3 ได้
   คงนิยาม ok เดิม ไม่แก้เครื่องวัดของอีกฝั่งใน branch นี้
5. ผ่านได้เมื่อ days=90 ครบ 3/3 ไม่มี partial error และทุกครั้งต่ำกว่า ~15 วินาที
   ถ้ายังช้า ให้ดู per-query D1 plan/timing จริงก่อนขยายงานเป็น expression index/summary table
   ไม่เดาว่าต้อง migration และไม่ merge/deploy โดยถือว่าผลในเครื่องคือผลจริง
