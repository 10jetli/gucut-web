# ล่าบั๊กที่กระทบเงิน: ส่วนลดออเดอร์เชื่อค่าจากผู้ซื้อ

งาน t_mtx4rvsd · Codex · 13 ก.ย. 2569 · ฐาน gucut-web 4e19553

พบหนึ่งประเด็นที่พิสูจน์ได้ ไม่เพิ่มข้อสันนิษฐานให้ดูเหมือนพบหลายบั๊ก ไม่มีการแก้โค้ดหรือยิงสร้างออเดอร์/charge จริง

## สูง: ผู้เรียกกำหนดส่วนลดเองก่อนสร้าง charge

`netlify/functions/orders.mjs:140–142` ใช้ `Math.min(money(body.discount), subtotal)` โดยอ้างว่าคูปองตรวจไปแล้วที่ /api/coupon แต่ endpoint POST /api/orders ไม่ตรวจสิทธิ์/โค้ดคูปองซ้ำฝั่งเซิร์ฟเวอร์ ผู้เรียก POST ข้ามหน้าจอได้ และ couponCode เป็น null ก็ยังยอมลด

เส้นทางมีผลจริงกับเงิน: total ที่ :159 → order.total → createQrCharge({baht:total}) ที่ :222–227 การแก้ราคาให้ตรง ZORT ที่ :128–133 ไม่ป้องกัน เพราะส่วนลดถูกหักหลังตรวจราคา

## ผล fixture ผ่าน handler ตัวจริง

ผู้ซื้อจำลองไม่ล็อกอิน สินค้าที่ตัวแทน ZORT ยืนยันราคา 1,000 จำนวน 1 มีอยู่ใน map จึงไม่ต้องอาศัย ZORT ล่ม/ไม่มี SKU:

| คำขอจำลอง | HTTP | subtotal ที่เก็บ | discount ที่เก็บ | couponCode | จำนวนที่ส่งให้ตัวแทน Beam |
|---|---|---|---|---|---|
| discount=0 | 200/ok | 1,000 | 0 | null | 1,080 |
| discount=1,000 | 200/ok | 1,000 | 1,000 | null | 70 |

ส่วนต่างเกิดจากการยอมรับส่วนลดเต็มราคาสินค้าและคำนวณค่าส่งตามยอดหลังลด การคืน 200 ไม่ใช่แค่ข้อความบนจอ: fixture จับ argument ของ createQrCharge และออเดอร์ที่ setJSON เก็บจริงในหน่วยความจำ

ไม่มี charge หรือออเดอร์บนระบบจริงเกิดขึ้น ทุกผลข้างเคียงถูกแทนด้วยหน่วยความจำ; fetch ออกนอกถูกตั้งให้ throw; finalization/แจ้งเตือนถ้าเผลอถูกเรียกจะ throw ด้วย

## ผลกระทบและเกณฑ์แก้

ผู้ซื้ออาจได้คำขอชำระยอดต่ำกว่าราคาที่ร้านกำหนดและนำไปสู่การขายขาดรายได้ ไม่ยืนยันว่ามีใครใช้ช่องนี้กับร้านแล้ว และไม่อ้างว่าจุดแพ็กของจะไม่มีคนจับได้

ให้เซิร์ฟเวอร์ resolve ราคาสินค้าและประเมิน couponCode/สิทธิ์/วันหมดอายุ/ยอดขั้นต่ำ/สินค้า/บัญชี/โควตาเองก่อนออก charge ไม่ใช้ body.discount เป็นอำนาจอนุมัติ หากร้านมีส่วนลดเฉพาะกิจ ต้องมีสิทธิ์เจ้าหน้าที่และหลักฐานอนุมัติฝั่งเซิร์ฟเวอร์แยกจากคำขอผู้ซื้อ ตรวจตอนใช้จริงและจัดการโควตาพร้อมกันด้วย identity เดิมอย่างชัดเจน

เกณฑ์ทดสอบก่อนปิดบั๊ก: coupon หาย/ปลอม/หมดอายุ/ใช้ผิดสินค้า/เกินโควตา/ใช้พร้อมกัน, discount ที่ client ดัดแปลง, ราคาที่เปลี่ยนหลังเพิ่มตะกร้า, retry charge หลัง timeout; ทุกกรณีต้องคิดยอดจากสิทธิ์ที่ server ยืนยัน และไม่สร้าง charge ซ้ำเมื่อตรวจไม่รู้ผล

## การทำซ้ำอย่างปลอดภัย

สคริปต์ภาคผนวกอ่าน orders.mjs เดิมด้วย vm.SourceTextModule, ใช้ shipping.mjs จริง และ mock เฉพาะระบบภายนอก รัน `node --experimental-vm-modules /tmp/checkout-proof.mjs /path/to/gucut-web` ไม่มีคีย์จริงและไม่เรียก HTTP endpoint ร้าน

```javascript
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const root=process.argv[2] || process.cwd();
const captured=[];const stored=new Map();
const ctx=vm.createContext({Request,Response,URL,URLSearchParams,Headers,AbortSignal,Date,console,process:{env:{}},fetch:async()=>{throw Error('network forbidden');}});
const modules=new Map();
function stub(id,obj){const m=new vm.SyntheticModule(Object.keys(obj),function(){for(const[k,v]of Object.entries(obj))this.setExport(k,v);},{context:ctx,identifier:id});modules.set(id,m);}
stub('@netlify/blobs',{getStore:()=>({get:async k=>stored.get(k)||null,setJSON:async(k,v)=>{stored.set(k,structuredClone(v));}})});
stub('../lib/push.mjs',{pushToAdmins:async()=>{throw Error('unexpected push');}});
stub('../lib/admin-gate.mjs',{adminGate:async()=>({ok:false})});
stub('../lib/session.mjs',{currentUser:async()=>null,normPhone:x=>x,store:()=>({})});
stub('../lib/coupons.mjs',{markUsed:async()=>{throw Error('unexpected markUsed before payment');}});
stub('../lib/points.mjs',{addPoints:async()=>{},earnFrom:()=>0,readLoyalty:async()=>({}),redeemPlan:()=>({points:0,discount:0})});
stub('../lib/site.mjs',{SITE_HOST:'fixture.invalid',SITE_URL:'https://fixture.invalid'});
stub('../lib/marketing.mjs',{sendPurchase:async()=>{throw Error('unexpected marketing');}});
stub('../lib/order-finalize.mjs',{finalizeOrder:async()=>{throw Error('unexpected finalize');}});
stub('../lib/beam.mjs',{beamReady:()=>true,chargePaid:()=>false,createQrCharge:async x=>{captured.push(x);return{chargeId:'fixture',expiry:1,qrBase64:'fixture'};},getCharge:async()=>null});
stub('../lib/zort-stock.mjs',{liveStock:async()=>({map:{'FIXTURE-SKU':[100,1000]}})});
async function load(id){if(modules.has(id))return modules.get(id);const file=id==='orders'?root+'/netlify/functions/orders.mjs':path.resolve(root+'/netlify/functions',id);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:ctx,identifier:id,importModuleDynamically:async spec=>{const d=await load(spec);if(d.status==='unlinked')await d.link(load);if(d.status==='linked')await d.evaluate();return d;}});modules.set(id,m);return m;}
const main=await load('orders');await main.link(load);await main.evaluate();
for(const discount of [0,1000]){
 const req=new Request('https://fixture.invalid/api/orders',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer:{name:'fixture',phone:'0800000000',address:'fixture'},items:[{title:'fixture',sku:'FIXTURE-SKU',price:1000,qty:1}],payment:'beam',discount})});
 const response=await main.namespace.default(req,{ip:'fixture'});const result=await response.json();const order=[...stored.entries()].filter(([k])=>k.startsWith('o/')).at(-1)?.[1];
 console.log(JSON.stringify({requestedDiscount:discount,http:response.status,ok:result.ok,beamBaht:captured.at(-1)?.baht,storedSubtotal:order?.subtotal,storedDiscount:order?.discount,couponCode:order?.couponCode}));
}
```
