# สำรวจตารางแปลงรหัส TikTok ก่อนดันสต็อก

งาน t_mtx48c7l · 13 ก.ย. 2569 · gucut-web ฐาน 4e19553 · สำรวจอย่างเดียว ไม่มีการแก้โค้ดหรือยิง API ร้าน

## ข้อสรุป

จากโค้ดที่ค้นทั้ง netlify/lib และ netlify/functions ยังไม่พบตาราง/ตัวเก็บความสัมพันธ์ครบ `shop → product_id → sku_id → seller_sku → warehouse_id` ที่ผู้ดันสต็อกเรียกใช้ได้ ตัวอ่านสินค้าปัจจุบันมีจุดที่รับ response เหมาะจะเก็บความสัมพันธ์ แต่ทิ้งรหัสและข้อมูลคลังเมื่อแปลงผลลัพธ์ จึงสร้าง mapping กลับจากแผนดันเดิมไม่ได้

ยังไม่ยืนยันว่ามีข้อมูล mapping เก็บไว้ภายนอก repo หรือในฐานจริงหรือไม่ งานนี้ไม่เปิด Blobs/D1 และไม่มีคีย์สำหรับสำรวจฐาน จึงไม่อ้างจำนวนสินค้าจริงหรือคู่รหัสจริงของร้าน

## จุดที่มีอยู่แล้วและข้อจำกัด

| จุด | สิ่งที่เก็บ/คืนจริง | ทำไมยังใช้เป็น mapping สำหรับเขียนไม่ได้ |
|---|---|---|
| tiktok-stock.mjs:65–71 tiktokStock | เรียก products/search แล้วส่งให้ collectTiktokStock | ใช้ POST แม้เป็นการค้นหา; ไม่เรียกในงานนี้ตามข้อห้าม POST |
| tiktok-stock.mjs:108–118 collectTiktokStock | sku=seller_sku, name, qty | ไม่เก็บ product id, sku id, warehouse id; qty รวมคลังแล้ว |
| marketplace-listings.mjs:58–79 tiktokSkus | Set ของ seller_sku | ไม่มีรหัส TikTok และ Set ลบหลักฐานกรณี seller_sku ซ้ำหลาย listing |
| marketplace-listings.mjs:239–246 cache | seller_sku → ป้ายชื่อแพลตฟอร์ม | ระบุว่าลงขายที่ไหน ไม่ระบุ listing/SKU ที่ต้องเขียน |
| tiktok-orders.mjs:37,74,236 | ฟิลด์ sku ตัวเดียวในรายการออเดอร์ | fallback seller_sku→sku_id→sku ทำให้คอลัมน์ปนคนละชนิดรหัส; ไม่ได้เก็บ product_id/sku_id แยก จึงห้าม reverse-engineer เป็น mapping ที่เชื่อถือได้ |
| tiktok-stock.mjs:132–149 tiktokProductShape | ชื่อ field ของ product/sku/inventory ตัวอย่างแรก | ไม่มีค่ารหัสตามความตั้งใจ และใช้ POST products/search |
| stock-push.mjs:254–262 | sku, platformQty, coreQty, directQty | ไม่มีปลายทาง product/sku/warehouse; TikTok comparator ยังไม่ส่ง directQty แบบ Shopee/Lazada |
| stock-push-live.mjs:237–241 | ยอมรับเฉพาะ lazada | ตัวเขียน TikTok ยังไม่ถูกสร้างตาม guard เดิม |

ข้อควรระวังในการสำรวจ: GET /api/core?tiktokshape=1 และ GET /api/core?tiktokstock=1 เป็น GET แค่ประตูหน้า แต่ภายในยิง POST products/search; ensureShop ยังอาจบันทึก token/shop metadata ลง Blobs การเรียก GET wrapper จึงไม่ตรงข้อกำหนด “ห้าม POST” และ “สำรวจไม่เขียน” โดยอัตโนมัติ

## เอกสารทางการที่ตรวจได้

[Get Product 202309](https://partner.tiktokshop.com/docv2/page/get-product-202309) ระบุ GET `/product/202309/products/{product_id}` และ scope seller.product.basic จึงเป็นทางอ่านรายละเอียดราย product เมื่อมี product_id อยู่แล้ว ไม่มีการเรียก endpoint นี้ด้วยคีย์ร้านในงานนี้

[Update Inventory 202309](https://partner.tiktokshop.com/docv2/page/update-inventory-202309) ระบุ POST `/product/202309/products/{product_id}/inventory/update`, scope seller.product.write และตัวอย่าง body ใช้ `skus[].id` กับ `inventory[].warehouse_id/quantity` จึงต้องมีทั้งรหัส SKU และคลังปลายทาง ไม่ใช่ seller_sku ตัวเดียว ทั้งนี้อ่านเอกสารเท่านั้น ไม่ส่งคำขอเขียน

ข้อจำกัดการอ่านเอกสาร: หน้าเว็บโดยตรงบางหน้าเป็น JavaScript shell/timeout; ข้อเท็จจริงข้างต้นมาจากเนื้อหาหน้าทางการที่ระบบค้นหาอ่านได้ ไม่ใช่ผลทดสอบกับร้านจริง อย่ายึดว่า field ของ Search จะเหมือน Get Product ทุกช่องจนกว่าจะมี payload ตัวอย่างที่ลบข้อมูลลับแล้ว

## Fixture ที่พิสูจน์การทิ้งข้อมูล

เรียก collectTiktokStock ตัวจริงในหน่วยความจำ แทน fetchPage ด้วยหน้าเดียวจำลอง:

```json
{"data":{"total_count":1,"products":[{"id":"9007199254740993","title":"fixture","skus":[{"id":"9007199254740995","seller_sku":"03409-3","inventory":[{"warehouse_id":"WH-A","quantity":2},{"warehouse_id":"WH-B","quantity":3}]}]}]}}
```

ผลจริง:

```json
{"rows":[{"sku":"03409-3","name":"fixture","qty":5}],"unmapped":[],"noSku":0,"productsSeen":1,"apiTotal":1,"sawAllProducts":true}
```

mapping และการแจกแจงคลังหายแล้ว แม้ sawAllProducts=true จึงห้ามเอา qty=5 ไปเขียน 5 ในแต่ละคลัง รหัสในตัวอย่างเป็นข้อมูลจำลอง ไม่ใช่รหัสร้าน

ทำซ้ำจาก checkout:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs';
const code=fs.readFileSync('netlify/lib/tiktok-stock.mjs','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const collect=new Function(code+'\nreturn collectTiktokStock;')();
console.log(await collect(async()=>({data:{total_count:1,products:[{id:'9007199254740993',title:'fixture',skus:[{id:'9007199254740995',seller_sku:'03409-3',inventory:[{warehouse_id:'WH-A',quantity:2},{warehouse_id:'WH-B',quantity:3}]}]}]}})));
JS
```

## รูปร่างข้อมูลที่เสนอสำหรับขั้นออกแบบต่อ (ยังไม่สร้างตาราง)

- แถว mapping: shop_id, product_id, sku_id, seller_sku, product_status, observed_at, source_endpoint, schema_version
- รหัส platform ทั้งหมดเป็น string ห้าม Number() เพราะ id ยาวอาจเกิน safe integer; seller_sku คงเลขศูนย์หน้าและแยกจาก platform SKU id
- คีย์หลัก (shop_id,product_id,sku_id); index seller_sku เป็นความสัมพันธ์หนึ่งต่อหลาย **ไม่บังคับ unique seller_sku** จนตรวจของจริงและกำหนดนโยบายความซ้ำ
- แถว inventory แยก (shop_id,product_id,sku_id,warehouse_id), quantity, observed_at; ยังไม่กำหนดวิธีจัดสรรยอดรวมลงหลายคลังแทนร้าน
- สถานะรอบอ่าน: declared_products, seen_unique_products, sku_rows, no_seller_sku, missing_ids, duplicate_ids, duplicate_seller_sku, failed_products, complete/unknown พร้อม scope ACTIVATE/สถานะอื่นที่อ่าน
- แยก last_complete กับ partial; รอบอ่านล้มไม่ลบ mapping เก่าหรืออ้างว่าของหาย; การดันต้องตรวจอายุและสถานะสินค้าอีกครั้ง

## ลำดับที่ปลดล็อกได้โดยไม่เดา

1. ขอข้อมูลส่งออก/response ที่เก็บอยู่แล้วจากผู้มีสิทธิ์ ให้มีเฉพาะ shop/product/sku/seller_sku/status/inventory ไม่ต้องมี token หรือข้อมูลลูกค้า จากนั้นพิสูจน์ชื่อ field และ cardinality จริง
2. หากมี product_id แล้ว ผู้รีวิวใช้ Get Product (GET) ตรวจเป็นรายตัวได้โดยไม่เรียก Search POST; ต้องใช้ credential handling ที่ไม่ refresh/save token ในงานสำรวจหากกำหนดไม่เขียน
3. จัดทำ mapping snapshot พร้อมรายงาน coverage/duplicates/missing ids และทดสอบกรณี id ยาว, seller_sku ว่าง/ซ้ำ, หลายคลัง, หน้าอ่านไม่ครบ, SKU เปลี่ยนชื่อ, สินค้าปิดขาย
4. ยังไม่สร้างตัวยิงจนมีด่านใบค้างส่ง/ยืนยันของบนชั้น และแก้ปัญหาแผนบางส่วนที่พบใน count-audit; รวมถึงพิจารณาฐานร่วมหลาย SKU และ directQty ที่ TikTok ยังไม่ส่ง

mapping เป็นเงื่อนไขจำเป็นส่วนหนึ่ง แต่ยังไม่เพียงพอให้เปิดดันสต็อกจริง งานสำรวจนี้ไม่มีการอนุมัติหรือเปิดตัวยิง

## การตรวจ

fixture ตัวอ่านจริงผ่านตามผลข้างต้น; diff-check ผ่าน กิ่งนี้เพิ่มรายงานอย่างเดียว ใช้ฐานโค้ดเดียวกับ count-audit 4e19553 ซึ่ง build/check-floating/check-leaks ผ่านในรอบงานเดียวกัน ไม่มีการรัน API ของ TikTok หรือเขียนข้อมูลร้าน ไม่มี deploy ใหม่
