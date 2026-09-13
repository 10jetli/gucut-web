# ตรวจความเชื่อถือได้ของคลังเงาก่อนใช้แทน ZORT

งาน t_mtx4rtkl · Codex · 13 ก.ย. 2569 · ฐาน gucut-web 4e19553

## ผลตัดสินจากหลักฐาน

ยังใช้ผล “ซิงก์สำเร็จ/ยอดตรงกัน” ที่มีอยู่รับรองความถูกต้องทั้งคลังไม่ได้ พบเส้นทางที่ข้อมูลขาดหรือค้างแล้วรอบซ่อมข้าม และเส้นเทียบยอดใช้ตัวดึงที่มีข้อจำกัดเดียวกับตัวซิงก์ ตัวเลข 58,774 ออเดอร์มาจากคำสั่งงาน ไม่ได้ยืนยันด้วยการอ่านฐานจริงในรอบนี้

นี่คือการตรวจซอร์สข้ามส่วนสำคัญและทดสอบความล้มเหลวใน SQLite หน่วยความจำ ไม่ใช่การตรวจทุกแถวบน production ไม่ใช้คีย์ ไม่ยิง API ร้าน ไม่แก้โค้ด ไม่เขียนฐานจริง

## ประเด็นยืนยันด้วย SQL และฟังก์ชันจริง

### สูง — R1 หัวใบเขียนสำเร็จ แต่รายการสินค้าล้มแล้วไม่ถูกซ่อมเอง

`netlify/lib/core-sync.mjs:144–171` upsert หัว orders ก่อน :183–243 ลบ/เขียน order_items; รอบใหม่ใช้ same() ที่ :118–140 เทียบหัวใบและเลือกเฉพาะ changed

Fixture: API มีออเดอร์หนึ่งใบ รายการหนึ่งบรรทัด; ให้ SQL INSERT order_items ล้มหลังเขียนหัว/ลบบรรทัด แล้ว retry ด้วย API เดิม → headers=1, items=0; ผล retry orders=1,written=0,skipped=1,items=0 งานวิ่งจบแต่บรรทัดหายค้าง

ผลกระทบ: รายงานตาม SKU, สต็อกขายออก, โควตาคืนสินค้า remainingFor และเอกสารที่ใช้ line items อ่านข้อมูลขาด ขณะที่ยอดหัวใบ/จำนวนใบยังถูก จึงผ่าน recon แบบนับหัวใบได้

เกณฑ์แก้: หัวและรายการต้อง commit เป็นรุ่นสมบูรณ์เดียวกัน หรือมีสถานะ incomplete ที่ retry เลือกมาซ่อมเสมอ; ตัดไฟทุกจุดระหว่างหัว/ลบรายการ/เขียนแต่ละก้อนแล้วรันซ้ำต้องกลับมาครบ ไม่ถือว่าเขียนหัวสำเร็จเท่ากับเสร็จทั้งใบ

### สูง — R2 เปลี่ยนเฉพาะรายการสินค้า แต่ยอดหัวเท่าเดิม → เก็บรายการเดิมต่อไป

same() ไม่อ่าน fingerprint หรือจำนวน/รหัส/ราคาแต่ละ line; forItems = changed ยกเว้นสั่ง range.items='all' ด้วยมือ

Fixture: sync ใบราคา 100 ที่มี SKU A แล้ว API เปลี่ยนเป็น SKU B ราคาหัว 100 เท่าเดิม → รอบถัดไป written=0,skipped=1; ในฐานยัง A

ผลกระทบ: จำนวนขาย/คืนได้ผิดตัวและรายงานกำไรผิด SKU แม้ยอดรวมเงินตรงทุกวัน

เกณฑ์แก้: เปรียบเทียบ canonical line fingerprint (รวมลำดับ/รหัส/จำนวน/ราคา/ส่วนลดตามสัญญา) และรุ่นตัวแปลง; วางแผนซ่อมข้อมูลเก่าตามช่วง ไม่เปิด rewriteAll ทั้งฐานโดยไม่ประเมินโควตา D1

### สูง — R3 ตัดที่ 8 หน้า แล้วตัว recon ตัดแบบเดียวกัน → เขียวทั้งที่ขาด

fetchOrders :23,65–80 จำกัด MAX_PAGES=8/PAGE=200 และไม่ตรวจ d.count/ไม่รายงานว่าเต็มเพดาน ทั้ง syncOrders และ reconYesterday เรียกตัวนี้

Fixture เมื่อวานตามวันไทยจริง: API count=1601 และมีข้อมูลครบตามหน้าที่ร้องขอ → sync ได้ 1600; recon ขอข้อมูลด้วยเพดานเดียวกัน ได้ zortOrders=1600,coreOrders=1600,zortAmount=160000,coreAmount=160000,match=true ทั้งที่มีอีกหนึ่งใบอยู่นอกหน้า

ผลกระทบ: การกวาดกว้าง 45 วันยิ่งมีโอกาสชนเพดาน; เมื่อช่วงนั้นมีใบมาก การเพิ่ม days ไม่ได้พิสูจน์ว่าเก็บประวัติครบ ตัวอย่างเป็นการบังคับเพดาน ไม่อ้างว่ามียอดเกินเพดานจริงในร้านเมื่อวาน

เกณฑ์แก้: เก็บ count/unique IDs/จำนวนหน้าจริง, ติด partial เมื่อชนเพดานหรือ schema ผิด; ตัว recon ต้องใช้หลักฐานความครบอิสระก่อนสรุปตรง การใช้ parser ร่วมไม่ผิดเอง แต่ใช้ตัวตัดข้อมูลร่วมแล้วไม่มีเกณฑ์อิสระทำให้การตรวจบอด

### สูง — R4 แคชเก่าหรือ partial ถูกติดวันที่วันนี้เป็น snapshot โดยไม่เก็บอายุข้อมูลจริง

snapshotStock :332–351 อ่าน cache.map แล้ว upsert ด้วยวันไทยปัจจุบัน ไม่ตรวจ cache.at/partial และไม่บันทึก source timestamp; listStock และตัวเทียบใช้ MAX(day)

Fixture: cache.at=1,partial=true,map มี A=10 → snapshot คืน day=วันปัจจุบัน และตารางเก็บ A10 ในวันนั้นโดยไม่มีธงอายุ/partial

ผลกระทบ: “ภาพถ่ายวันนี้” อาจหมายถึงนำค่าที่เก่ามาติดวันที่ใหม่ สินค้าที่ไม่อยู่ใน cache ของรอบถัดไปวันเดียวกันก็ไม่ได้ถูกลบจาก snapshot โดยฟังก์ชันนี้ จึงมีโอกาสปนหลายรุ่นในวันเดียว ต้องตรวจนโยบาย cache และรอบข้อมูลร่วมกัน ไม่ถือว่า MAX(day) รับรองความสด

เกณฑ์แก้: แยก captured_at กับ source_observed_at; บันทึก run_id/coverage และเผยแพร่เฉพาะรุ่นสมบูรณ์ หากใช้ last-known-complete ต้องประกาศ stale ไม่เปลี่ยนวันที่ต้นทางเป็นวันนี้

## การสำรวจข้ามส่วนและสิ่งที่ยังไม่รับรอง

| ส่วน | ตรวจแล้ว | ข้อจำกัด/เงื่อนไขก่อนเชื่อ |
|---|---|---|
| ออเดอร์ ZORT สองร้าน | namespace z1/number และ z2/number แยกจริง; sync ปกติ 7 วัน/กว้าง 45 วัน | ใบแก้ย้อนหลังเกิน 45 วันไม่มีการกวาดประจำที่ตรวจพบใน core-sync; ต้องมี modified-date/change feed หรือ backfill แบ่งช่วง |
| รายงาน order lists | SQL และตัวนับใช้ orders/order_items | ต่อให้ SQL รวมถูก ก็รวมข้อมูลที่ R1/R2/R3 ทำให้ผิดได้ ต้องพิสูจน์ source coverage/line completeness ก่อน |
| สต็อก/ทะเบียน/หมวด | snapshotStock, syncProducts และ stock-push | ใช้ข้อพบ count-audit แยก: ตัวหาร all.length และ partial ที่ไม่พ่วงถึงจอ; แผนดันไม่ใช้ coverage flags ครบ |
| Shopee/TikTok กระจก/สต็อก | ตรวจทางอ่านจำนวนและการส่งเข้าแผน; TikTok แยกหัว/รายการและมี items_fp เป็นแบบอย่างที่ควรประเมิน | ยังไม่ยืนยันรูปฟิลด์จริง/ข้อมูลทุกบัญชี; mapping TikTok สูญเสีย platform IDs ตามรายงาน t_mtx48c7l |
| ใบซื้อ/โอน | อ่านโครง core-purchases และทางเรียกในงานรายวัน | PO เป็นคนละเอกสารกับรับของจริง; แหล่งหลักใช้ credential z1 ไม่ใช่หลักฐานว่าครอบทุกนิติบุคคล ต้องทำ inventory เอกสารต่อ source |
| คืนสินค้า/stock_moves | remainingFor อิง order_items; uniqueness(reason,ref,sku) กัน replay | R1/R2 ทำโควตาคืนผิดได้; stock_moves กับ returned state/คืนเงินเป็นคนละความจริง ต้อง reconcile แยก |
| สำรอง/กู้คืน | พบ backup และ restore ใน repo | การมีสำรองไม่ใช่ผลกู้คืนผ่าน ไม่รัน restore จริง; ต้องทดสอบกู้ในฐานแยก + totals + line digest + orphan checks ก่อนสับแหล่งข้อมูล |
| ราคา/การชำระ/คืนเงิน | แยกงานเงินออกจากเลขคลัง | ตรวจพบส่วนลดจาก client ไม่ถูกยืนยันก่อนขอ charge ในงาน t_mtx4rvsd ห้ามใช้ยอดออเดอร์ในคลังแทนหลักฐานรับเงินจากผู้ให้บริการ |

ข้อมูลเดิมที่ทีมรู้แล้ว เช่น ship_channel/ship_name/ship_date/is_cod ไม่อยู่ใน same() และต้อง backfill ไม่ถูกนับเป็นสิ่งค้นพบใหม่ของรายงานนี้ เพียงเป็นหนี้ที่ยังต้องปิดก่อนรับรองความครบทั้งระบบ

## ชุดหลักฐานที่ผู้มีสิทธิ์ควรเก็บก่อนประกาศใช้แทน ZORT

1. บัญชีราย source/ชนิดเอกสาร/ช่วงวัน: expected จากต้นทาง, fetched_unique, stored, rejected, unreadable, duplicates, start/end/run_id และ watermark ของการแก้ไข; ไม่ใช้ยอดรวมเดียวซ่อนร้านที่ขาด
2. สำหรับหัวขายทุกใบที่ควรมีสินค้า: จำนวน lines, line fingerprint และ amount composition; ตรวจ orphan และ incomplete ไม่ใช้เพียง SUM(amount) เทียบกัน
3. การยกเลิก/คืนเงิน/คืนของ/ของจอง/รับเข้า/โอนต้องแยกสถานะและหน่วย; ยอดเก่าในหน้าต่างที่ปิดไปแล้วต้องมีช่องค้นการเปลี่ยนย้อนหลัง
4. สต็อกต่อ SKU+คลัง+หน่วยและเวลาต้นทาง พร้อม allocation สำหรับชุด/รหัสฐานร่วม ตรวจอิสระทั้งยอดบวก/ศูนย์/ลบและ SKU ที่ไม่เคยขาย
5. ทดสอบตัดไฟ/timeout หลังทุกผลข้างเคียง แล้ว retry ด้วย identity เดิม ต้องซ่อมครบโดยไม่เพิ่มสต็อก/คืนเงินซ้ำ
6. เก็บผล restore drill จากฐานแยกและรายการ gap ที่อนุมัติให้ค้างอย่างชัดเจน จนกว่าจะผ่าน ให้ป้าย “กระจก/ยังตรวจไม่ครบ” กับจุดที่ยังขาดหลักฐาน

คำสั่ง SQL อ่านอย่างเดียวเริ่มต้นสำหรับผู้รีวิว (ไม่ใช่ข้อพิสูจน์ครบต้นทาง):

```sql
SELECT source, COUNT(*) AS n, MIN(order_date), MAX(order_date) FROM orders GROUP BY source;
SELECT o.id, o.source, o.amount FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id=o.id);
SELECT i.order_id FROM order_items i LEFT JOIN orders o ON o.id=i.order_id
WHERE o.id IS NULL GROUP BY i.order_id;
SELECT day, COUNT(*) AS n FROM stock_snapshots GROUP BY day ORDER BY day DESC;
```

ใบที่ไม่มีรายการต้องจำแนกด้วยเอกสารจริง ไม่ตีว่าผิดทุกใบโดยอัตโนมัติ และ “ไม่พบ orphan” ไม่ได้พิสูจน์ว่าสินค้าในใบตรงกับ ZORT

## การทำซ้ำ

ภาคผนวกใช้ Node 22 `node:sqlite` ในหน่วยความจำ ทุก SQL มาจาก syncOrders/reconYesterday/snapshotStock ตัวจริง ตัวแทนมีเฉพาะ fetch/coreQuery/Blobs และ env ชื่อ fixture ไม่มีการเชื่อมต่อภายนอก ตัวอย่างวันที่มาจากเวลาปัจจุบันแล้วแปลง +7 ตามโค้ดจริง

บันทึกสคริปต์เป็น /tmp/core-reliability.mjs แล้วรัน `node /tmp/core-reliability.mjs /path/to/gucut-web` ได้ผล 4 กรณีที่รายงาน ข้อจำกัดของ SQLite fixture: พิสูจน์ตรรกะและลำดับ SQL ไม่ได้จำลอง latency/โควตา/ทุกความต่างของ D1 production

```javascript
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const root=process.argv[2] || process.cwd();
const source=fs.readFileSync(root+'/netlify/lib/core-sync.mjs','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const yesterday=new Date(Date.now()+7*3600e3-864e5).toISOString().slice(0,10);
function setup(count=1) {
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE orders(id TEXT PRIMARY KEY,source TEXT,number TEXT,channel TEXT,status TEXT,amount REAL,customer TEXT,order_date TEXT,updated_at TEXT,tracking_no TEXT,ship_channel TEXT,ship_name TEXT,ship_date TEXT,is_cod INTEGER,pay_status TEXT,integration_status TEXT,bill_discount REAL,ship_amount REAL);
 CREATE TABLE order_items(order_id TEXT,line INTEGER,sku TEXT,name TEXT,qty REAL,amount REAL,PRIMARY KEY(order_id,line));
 CREATE TABLE core_meta(k TEXT PRIMARY KEY,v TEXT,at TEXT);
 CREATE TABLE recon_log(day TEXT PRIMARY KEY,zort_orders INTEGER,zort_amount REAL,core_orders INTEGER,core_amount REAL,diff_notes TEXT,at TEXT);
 CREATE TABLE stock_snapshots(day TEXT,sku TEXT,qty REAL,price REAL,PRIMARY KEY(day,sku));`);
 const records=Array.from({length:count},(_,i)=>({number:'F'+i,orderdateString:yesterday,status:'success',saleschannel:'fixture',amount:100,customername:'fixture',list:[{sku:'A',number:1,pricepernumber:100,totalprice:100}]}));
 let failItems=false;
 const coreQuery=async(sql,params=[])=>{
  if(failItems && sql.includes('INSERT INTO order_items')) throw Error('fixture interruption after header/delete');
  const st=db.prepare(sql);return /^\s*(SELECT|WITH)/i.test(sql)?st.all(...params):(st.run(...params),[]);
 };
 const fetch=async url=>{const u=new URL(url);if(!u.pathname.endsWith('/Order/GetOrders'))throw Error('network forbidden');const p=Number(u.searchParams.get('page'));return {ok:true,json:async()=>({count:records.length,list:records.slice((p-1)*200,p*200)})};};
 const process={env:{ZORT_STORENAME:'fixture',ZORT_APIKEY:'fixture',ZORT_APISECRET:'fixture'}};
 const getStore=()=>({get:async()=>({at:1,partial:true,map:{A:[10,100]}})});
 const api=new Function('process','fetch','coreReady','coreQuery','getStore',source+'\nreturn {syncOrders,reconYesterday,snapshotStock};')(process,fetch,()=>true,coreQuery,getStore);
 return {db,records,api,setFail:v=>{failItems=v;}};
}
{
 const x=setup();x.setFail(true);try{await x.api.syncOrders(7);}catch{}
 x.setFail(false);const retry=await x.api.syncOrders(7);
 console.log(JSON.stringify({case:'header-then-item-failure',retry,headers:x.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,items:x.db.prepare('SELECT COUNT(*) AS n FROM order_items').get().n}));
}
{
 const x=setup();await x.api.syncOrders(7);x.records[0].list[0].sku='B';
 const retry=await x.api.syncOrders(7);
 console.log(JSON.stringify({case:'items-only-change',retry,apiSku:'B',stored:x.db.prepare('SELECT sku FROM order_items').get().sku}));
}
{
 const x=setup(1601);const sync=await x.api.syncOrders(7);const recon=await x.api.reconYesterday();
 console.log(JSON.stringify({case:'page-cap-shared-by-recon',declared:1601,synced:sync.stores.z1.orders,recon}));
}
{
 const x=setup();const result=await x.api.snapshotStock();
 console.log(JSON.stringify({case:'old-partial-cache-labelled-today',cacheAt:1,cachePartial:true,result,rows:x.db.prepare('SELECT * FROM stock_snapshots').all()}));
}
```
