# ตรวจอิสระ: การกวาดบั๊กเลขนับเองยังมีช่องว่างอะไร

งาน t_mtx48auv · 13 ก.ย. 2569 · Codex · รายงานอย่างเดียว ไม่แก้โค้ด
ตรวจ gucut-web `4e19553` และ gucut-next `6204713` จากซอร์สในเครื่อง ไม่ยืนยันสถานะ production และไม่ใช้คีย์ร้าน

## ข้อสรุป

งานกวาดแก้ปัญหาไปหลายจุดจริง แต่ข้อสรุปใน handoff ว่า `bucketsAddUp` ของตัวห่อรายแพลตฟอร์มเป็น “ตาข่ายข้ามแหล่ง” ยังไม่ตรงกับที่โค้ดทำ: ตัวหารมาจากจำนวนแถวที่ตัวดึงอ่านสำเร็จ ไม่ใช่จำนวน SKU ที่แพลตฟอร์มยืนยันอย่างอิสระ การดึงหายก่อนถึงตัวหารจึงยังทำให้ผลรวมลงตัวได้

พบประเด็นที่ควรแก้ต่อ 4 กลุ่มด้านล่าง ไม่ใช่ข้อสรุปว่าระบบทั้งหมดผิด และไม่ใช่หลักฐานว่าขายเกินเกิดขึ้นแล้ว การทดสอบเป็นข้อมูลจำลองที่รันฟังก์ชันจริงโดยแทนเฉพาะขอบ D1/Blobs/เครือข่าย

## 1. สูง: ผลดึงไม่ครบยังกลายเป็นแผนพร้อมส่ง รวม Lazada live

จุดอ้างอิง:
- `netlify/lib/shopee-stock.mjs:386` กำหนด shopeeSkus=withSku.length
- `netlify/lib/lazada.mjs:569` กำหนด lazadaSkus=rows.length
- `netlify/lib/tiktok-stock.mjs:246` กำหนด tiktokSkus=rows.length
- `netlify/lib/stock-push.mjs:149,192,266` ยกค่าข้างต้นเป็น platformSkus; :155,233,268 ใช้เป็นตัวหาร
- Shopee ส่ง sawAllItems ที่ :409 แต่ตัววางแผนไม่ส่งต่อ/ไม่หยุดตาม false; TikTok ส่ง sawAllProducts แต่ตัววางแผนก็ไม่ใช้
- `lazada.mjs:389` รับ declared จาก collectLazadaRows แต่ตรวจจำนวนประกาศเฉพาะกรณีไม่มีแถวเลย ที่ :396 เป็นต้นไป
- `stock-push-live.mjs:252` ตรวจ wouldPush เทียบความยาว push จึงตรวจเพียงว่าแผนที่คิดไว้ถูกส่งมาครบ ไม่ใช่ว่าต้นทางถูกอ่านครบ

พิสูจน์ด้วย fixture (ตัวเลขจำลอง):
| สถานการณ์ | ผลที่ฟังก์ชันจริงคืน |
|---|---|
| Shopee ประกาศ 2 สินค้า ดึง id มา 1 | sawAllItems=false แต่ planPlatformSkus=1, bucketsAddUp=true, wouldPush=1; ธง coverage หายจากแผน |
| Lazada ประกาศ 2 สินค้า ส่ง product มา 1 พร้อม SKU ที่สต็อก 0 | comparisonRows=1, bucketsAddUp=true, wouldPush=1; stockPushLive(dryCheck:true) ยัง wouldFire=1 |

ผลกระทบ: แผนบางส่วนอาจถูกอ่านว่าเป็นภาพทั้งร้าน และด่านก่อนยิง Lazada ไม่หยุดเพียงเพราะอ่านต้นทางไม่ครบ การมี wouldFire ไม่ได้แปลว่าข้อมูล SKU ที่เห็นผิดแน่ แต่ขาดหลักประกันความครบที่ทีมเชื่อว่ามี

ข้อเสนอ: เก็บจำนวนสินค้าและจำนวน SKU แยกหน่วย พร้อม coverage ของแต่ละขั้น ส่งผลตรวจครบผ่านถึงผู้ตัดสินใจจริง กรณี false/unknown ต้องกำหนดให้ชัดว่าจะพักทั้งรอบหรืออนุญาตเฉพาะรายการที่มีหลักฐานอย่างไร ห้ามนำจำนวน “สินค้า” ไปแทนตัวหารจำนวน “SKU” ตรง ๆ เพราะหนึ่งสินค้ามีหลายตัวเลือก

## 2. สูง: ด่านครบหน้าไม่ได้ครอบการอ่าน model; นับจำนวนอย่างเดียวจับรหัสซ้ำไม่ได้

จุดอ้างอิง `shopee-stock.mjs:55,97–119`: sawAll นับ ids.length แต่ get_model_list ของแต่ละสินค้าล้มแล้ว catch ข้ามได้ ไม่มีจำนวนอ่าน model ไม่ได้ส่งถึงแผน

Fixture ที่สอง: ดึง ids ครบ 2/2 แต่ model ของสินค้าตัวที่สอง throw → sawAllItems=true, shopeeSkus=1, planPlatformSkus=1, bucketsAddUp=true, wouldPush=1 ผลเขียวสองตัวอยู่พร้อมกับสินค้าที่หายจริงในข้อมูลจำลอง

Fixture รหัสซ้ำ: total_count=2 และรายการ ids=[1,1] → sawAll=true แม้มี id ไม่ซ้ำเพียงตัวเดียว จึงยังไม่พิสูจน์ว่าได้ทั้งสองสินค้าคนละตัว

ข้อเสนอ: นับ fetched/failed ของ model แยก, ตรวจความไม่ซ้ำของ id และความครอบคลุม expected id→ผลอ่าน ไม่ใช้ผลรวมอย่างเดียว ชุดทดสอบควรทำให้ขั้น “หลังไล่หน้าสำเร็จ” ล้มด้วย ไม่ใช่ทดสอบเฉพาะ has_next_page

## 3. สูง: ตัวหาร “ZORT มีทั้งหมด” ของจอหมวดยังมาจากการกวาดของเรา และอาจเป็นรอบไม่ครบ

จุดอ้างอิง:
- `core-products.mjs:34–65` มี partial=true เมื่อหน้าล้ม แต่กรณี payload ไม่ใช่ list ถูกแปลงเป็น []
- :82 zortTotal=all.length, :83 noSku=all.filter(...), :87–92 เขียน zort-product-counts แม้ partial และไม่ได้แนบ partial ลง cache ก้อนนี้
- `core-stock.mjs:403–408` นำ cache มาแสดงเป็น zortTotal/noSkuInZort พร้อมวันที่ แต่ไม่มีความครบของรอบเก็บ
- gucut-next `app/core/categories/page.tsx:394` แสดง “ครบตามที่ ZORT มี” เมื่อผลบวกตรง

นี่ไม่ใช่การอ่าน field count ที่ ZORT ประกาศ: มันเป็นจำนวนแถวที่เราเก็บมาเองจาก ZORT แม้ cache แยกจาก D1 ก็ยังมีต้นทางการกวาดร่วมกับข้อมูลที่นำไปเขียนทะเบียน หากรอบแรกหรือสองฝั่งหายสอดคล้องกัน ผลรวมเท่ากันไม่ได้รับรองว่าครบทั้ง ZORT และถ้าฐานเก่าครบแต่ cache รอบใหม่ขาดก็อาจเตือนเกินจริง

ข้อเสนอ: ส่งแหล่งที่มาและสถานะครบของการกวาดไปถึงจอ ใช้ count ที่ต้นทางประกาศถ้ามีและหน่วย/ตัวกรองเดียวกัน เก็บ last-known-complete แยกจากผล partial; ถ้าพิสูจน์ได้เพียงความครบเทียบกองที่อ่านมา ให้ป้ายบอกเท่านั้น

สถานะหลักฐาน: ไล่ dataflow ซอร์สครบ ไม่ยิง syncProducts เพราะเป็นทางเขียนข้อมูลจริง ไม่อ้างว่าปัจจุบัน cache บน production ขาด

## 4. กลาง: ตาข่าย category-net รับ null ถูก แต่จอแปลงค่าหายเป็น 0 ก่อนส่งเข้าตาข่าย

gucut-next `app/core/categories/page.tsx:98` ใช้ `Number(zj.noSkuInZort) || 0` ขณะที่ `lib/category-net.ts` และ test ตั้งใจให้ค่าหายเป็น unknown; ฝั่งท่อ `core-stock.mjs:406` ก็ใช้ num(counts.noSku) ซึ่งแปลงค่าหายเป็น 0 ได้ก่อนหน้านั้น

พิสูจน์ helper ตัวจริง:
- `{sumSkus:10,zortTotal:10}` → state=unknown
- ผ่านการแปลงแบบจอ `noSkuInZort:Number(undefined)||0` → state=ok, gap=0

test ของ helper จึงเขียวได้แม้สายเรียกจริงทำให้ “ไม่รู้” กลายเป็น “ไม่มีสินค้าไร้รหัส” ไปก่อนแล้ว

ข้อเสนอ: รักษาค่าหายให้เป็น null ตลอดสาย เพิ่ม fixture ผ่าน loader ของจอ/คำตอบ API จริง ทดสอบทั้ง missing, null, string, negative และตัวเลขครบ

## ขอบเขตงานที่มีอยู่แล้ว / สิ่งที่ไม่ควรนับเป็นบั๊กใหม่

- handoff ยอมรับแล้วว่า planFrom.bucketsAddUp ภายใน, shipStatusGroups และเครื่องมืออ่านซอร์สตรวจได้เพียงความสอดคล้อง ไม่ควรยกมาเป็น “สิ่งค้นพบใหม่” ซ้ำ
- การแก้ 0 แถวแล้วหยุด และการเลิกใช้ pushSample แทนรายการเต็ม ช่วยกันความผิดพลาดเฉพาะขั้นได้จริง ควรเก็บไว้
- บั๊ก B skipConflict ยังกัน diff ที่ directQty<0/coreQty>=0 ได้จริง แต่ไม่ได้พิสูจน์ความครบของตัวดึงหรือแก้การใช้ฐานร่วมหลาย SKU
- จอ unreadable เคยถูกแก้แล้วใน gucut-next `b23d27f`; ยังมีช่อง missing/invalid/empty-state ซึ่งแยกแก้ในงาน t_mtx48bgc ไม่ใช่แก้ในรายงานนี้

## สิ่งที่ควรเปลี่ยนในวิธีกวาดครั้งต่อไป

ทุกด่านควรระบุหน่วยที่นับ, จุดที่อาจทำข้อมูลหายก่อนนับ, อายุข้อมูล, แหล่งตัวหาร และผู้ใช้ผลตรวจ เลือก fixture ที่ทำให้หายก่อนตัวหาร/ซ้ำ/เปลี่ยนชนิด/ล้มหลังไล่หน้าครบ แล้วทดสอบต่อถึงจอหรือผู้อนุญาตเขียน ไม่หยุดที่ helper เดียวหรือ “ผลรวมลงตัว”

## การทำซ้ำ

สคริปต์ในภาคผนวกรัน source module ที่อยู่บน checkout โดยตรง ไม่มี network จริงและไม่ใช้ env/คีย์ร้าน ใช้ Node 22 พร้อม `--experimental-vm-modules` บันทึกเป็นไฟล์ชั่วคราว แล้วรัน:

```bash
node --experimental-vm-modules /tmp/count-audit.mjs /path/to/gucut-web/netlify/lib
```

ไม่มีการแก้ implementation ของตัวเทียบ/ตัววางแผน ตัวแทนมีเฉพาะ D1, Blobs, Shopee shopCall และ Lazada fetch; ไม่มี setJSON ให้เขียน และ fetch ปฏิเสธ path อื่นทุกเส้น

### ภาคผนวก: fixture ที่รันจริง

```javascript
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createHmac } from 'node:crypto';
const root = process.argv[2];
if (!root) throw new Error('Pass the checkout netlify/lib directory');
async function run(scenario) {
 const platformCount = 2;
 const rows = [{sku:'A',qty:10},{sku:'B',qty:10}];
 const c = vm.createContext({ console, URL, URLSearchParams, AbortSignal, Date, process:{env:{}},
  fetch: async input => {
   if (!String(input).startsWith('https://api.lazada.co.th/rest/products/get?')) throw Error('Network forbidden');
   return {json:async()=>({code:'0',data:{total_products:2,products:[{item_id:1,skus:[{SellerSku:'A',Status:'active',Available:0,quantity:0,SkuId:1}]}]}})};
  },
 });
 const cache = new Map();
 const stub = (key, exports) => {
  const m = new vm.SyntheticModule(Object.keys(exports), function(){ for(const [k,v] of Object.entries(exports)) this.setExport(k,v); }, {context:c,identifier:key});
  cache.set(key,m); return m;
 };
 stub('coredb.mjs',{coreReady:()=>true,coreQuery:async sql=>sql.includes('MAX(day)')?[{d:'fixture'}]:sql.includes('JOIN bundle_items')?[]:rows});
 stub('@netlify/blobs',{getStore:()=>({get:async()=>({accessToken:'fixture-only',expiresAt:Date.now()+172800000})})});
 stub('node:crypto',{createHmac});
 stub('shopee.mjs',{validToken:async()=>true,shopCall:async (api,q)=>{
  if(api.endsWith('get_item_list')) return {response:{item:(scenario==='missing-page'?[1]:[1,2]).map(item_id=>({item_id})),total_count:platformCount,has_next_page:false}};
  if(api.endsWith('get_item_base_info')) return {response:{item_list:[{item_id:1,item_sku:'A'},{item_id:2,item_sku:'B'}]}};
  if(api.endsWith('get_model_list')) {
   if(scenario==='model-failed' && q.item_id==='2') throw Error('fixture model fetch failed');
   return {response:{model:[{model_sku:q.item_id==='1'?'A':'B',stock_info_v2:{seller_stock:[{stock:0}]}}]}};
  }
  throw Error(api);
 }});
 async function load(key) {
  if(cache.has(key)) return cache.get(key);
  const m=new vm.SourceTextModule(fs.readFileSync(path.join(root,key),'utf8'),{context:c,identifier:key,importModuleDynamically:async spec=>{
   const child=await load(spec.startsWith('./')?spec.slice(2):spec);
   if(child.status==='unlinked') await child.link(link);
   if(child.status==='linked') await child.evaluate();
   return child;
  }});cache.set(key,m);return m;
 }
 const link=async spec=>load(spec.startsWith('./')?spec.slice(2):spec);
 const get=async key=>{const m=await load(key);if(m.status==='unlinked')await m.link(link);if(m.status==='linked')await m.evaluate();return m.namespace;};
 const sh=await get('shopee-stock.mjs');
 const plan=await get('stock-push.mjs');
 if(scenario==='duplicate-ids') {
  const d=await sh.collectShopeeItemIds(async()=>({response:{total_count:2,item:[{item_id:1},{item_id:1}],has_next_page:false}}));
  console.log(JSON.stringify({scenario,...d}));return;
 }
 if(scenario==='lazada-partial') {
  const lz=await get('lazada.mjs');const result=await lz.lazadaStockCompare({full:1});
  const p=(await plan.stockPushDryRun({platform:'lazada',full:true})).lazada;
  const live=await get('stock-push-live.mjs');const check=await live.stockPushLive({platform:'lazada',skus:['A'],dryCheck:true});
  console.log(JSON.stringify({scenario,apiDeclared:2,comparisonRows:result.lazadaSkus,bucketsAddUp:p.bucketsAddUp,wouldPush:p.wouldPush,dryCheck:check}));return;
 }
 const result=await sh.shopeeStockCompare({full:1});const p=(await plan.stockPushDryRun({platform:'shopee',full:true})).shopee;
 console.log(JSON.stringify({scenario,apiDeclared:result.shopeeItemTotal,idsSeen:result.itemsSeen,sawAllItems:result.sawAllItems,comparisonRows:result.shopeeSkus,planPlatformSkus:p.platformSkus,planCoverageFlag:p.sawAllItems??'absent',bucketsAddUp:p.bucketsAddUp,wouldPush:p.wouldPush}));
}
for(const scenario of ['missing-page','model-failed','duplicate-ids','lazada-partial']) await run(scenario);
```

### การตรวจ checkout

`npm run build` ผ่านครบ prebuild/check-floating, Next และ postbuild/check-leaks ใช้ environment ว่างและ fetch guard ปิดเครือข่าย จึงไม่ส่ง IndexNow หรือใช้คีย์ร้าน คืนไฟล์ที่ build สร้างใหม่ก่อน commit; กิ่งนี้มีเฉพาะรายงาน ไม่มีการแก้โค้ดระบบ
