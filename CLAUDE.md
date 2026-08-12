# GUCUT Storefront

เว็บขายเลื่อยยนต์ NEWWAVE / KingKong ของร้าน GUCUT — สไตล์ Shopee + TikTok Shop, mobile-first, ภาษาไทย, ราคาบาท

## โดเมน — อ่านก่อนแตะ robots.txt / sitemap
| | โดเมน | สถานะ |
|---|---|---|
| ตอนนี้ | **new78.com** | เว็บซ้อม · `robots.txt` ปิด Google ทั้งเว็บ (`Disallow: /`) |
| ภายหลัง | gucut.com | ยังไม่ย้าย — **เว็บยังไม่สมบูรณ์** |

**ห้ามเปิด `robots.txt` ให้ Google เก็บ จนกว่าเจ้าของร้านจะสั่งเอง** ถ้าเปิดตอนเว็บยังไม่เสร็จ Google จะเก็บหน้าที่ยังไม่พร้อม และลบออกทีหลังยาก

เมื่อเจ้าของร้านสั่งย้ายจริง ให้แก้ 4 จุดพร้อมกัน:
1. `src/app/layout.tsx` — ค่า `SITE`
2. `src/app/sitemap.ts` — ค่า `BASE`
3. `src/app/page.tsx` — ข้อความท้ายหน้าแรก
4. `public/robots.txt` — เปลี่ยนตามตัวอย่างที่คอมเมนต์ไว้ในไฟล์ (อย่าลืม `Disallow: /admin/` และ `/account/`)

## Tech Stack
- Next.js 15 (App Router) + TypeScript + Tailwind CSS 3
- ธีม: industrial steel (`#1a1d21`, `#2a2e33`) + safety orange (`#ff6b00`) — ดู `tailwind.config.ts`
- ฟอนต์: Kanit (หัวข้อ) + IBM Plex Sans Thai (เนื้อหา) โหลดผ่าน Google Fonts `<link>` ใน `layout.tsx`
- PWA: `src/app/manifest.ts` + `public/icon-192.png`, `icon-512.png`
- Deploy: Netlify (`netlify.toml` พร้อมแล้ว)

## วิธีรัน
```bash
npm install
npm run dev      # เปิด http://localhost:3000
npm run build    # ตรวจ build ก่อน deploy
```

## โครงสร้าง
```
src/
├── app/
│   ├── layout.tsx            # โครงหลัก + ฟอนต์ + BottomNav
│   ├── page.tsx              # หน้าแรก: ค้นหา / แบนเนอร์ / Flash Sale / grid สินค้า
│   ├── products/[handle]/    # หน้าสินค้า (เวอร์ชันย่อ — ทำเต็มขั้นถัดไป)
│   ├── categories|videos|cart|account/  # placeholder รอขั้นถัดไป
│   └── manifest.ts           # PWA manifest
├── components/               # SearchBar, BannerSlider, FlashSale, ProductCard, BottomNav
└── lib/
    ├── catalog.ts            # ข้อมูลสินค้า 2,482 รายการ (อยู่ในโค้ด ไม่เรียก API ใคร)
    ├── local-images.ts       # สลับ URL รูปมาเป็นไฟล์ใน public/img/
    └── useLiveStock.ts       # ดึงสต็อก/ราคาสดจาก ZORT ผ่าน /api/stock
```

## ข้อมูลสินค้า — ไม่พึ่ง Shopify แล้ว
สินค้า รูป และรีวิว **เก็บไว้ในโปรเจกต์นี้ทั้งหมด** ปิดร้าน Shopify ได้โดยเว็บไม่กระทบ:
- สินค้า 2,482 รายการ → `src/lib/catalog.ts` + `src/data/`
- รูปสินค้า 5,595 ไฟล์ → `public/img/` · รูปรีวิว 3,117 ไฟล์ → `public/rv/`
- สต็อก/ราคาสด → ZORT ผ่าน `netlify/functions/stock.mjs`

สคริปต์ใน `scripts/` ที่มีชื่อ Shopify เป็นเครื่องมือ **ย้ายข้อมูลออกมาครั้งเดียว** ไม่ได้รันตอนเว็บทำงาน

## สถานะ Phase 1 — ครบแล้ว ✅
- [x] หน้าแรก feed สไตล์ Shopee (แบนเนอร์ / Flash Sale countdown / grid สินค้า)
- [x] หน้าสินค้าเต็ม: รูปสไลด์ / variant / ปุ่มวิดีโอ / สเปกตาราง / ปุ่มซื้อติดล่างจอ
- [x] ตะกร้า localStorage + badge ที่ bottom nav
- [x] เช็คเอาต์: ฟอร์มที่อยู่ → QR PromptPay (gen เองใน `lib/promptpay.ts`) → แนบสลิป → POST `NEXT_PUBLIC_ORDER_WEBHOOK_URL`
- [x] หน้าวิดีโอ feed แนวตั้ง — ใส่ id คลิปจริงใน `src/lib/videos.ts` (ดูวิธีในไฟล์)
- [x] หมวดหมู่ + ตัวกรองราคา

## สิ่งที่เจ้าของร้านต้องใส่ก่อนเปิดใช้จริง
1. `NEXT_PUBLIC_PROMPTPAY_ID` — เบอร์ PromptPay รับเงิน
2. `NEXT_PUBLIC_ORDER_WEBHOOK_URL` — webhook จาก Make.com
3. id คลิป YouTube Shorts ใน `src/lib/videos.ts`
4. ตัวเลข "ขายแล้ว" และราคาก่อนลดจริงใน `src/lib/catalog.ts`

## Phase 2
> **ตัดสินใจแล้ว: เลิกใช้ Shopify** — ห้ามเสนอให้ต่อ Storefront API หรือย้ายกลับไป Shopify
> เว็บนี้ยืนด้วยตัวเองครบแล้ว (สินค้า/รูป/รีวิวอยู่ในโปรเจกต์ · สต็อกจาก ZORT · สมาชิกเก็บที่ Netlify Blobs · เก็บเงินด้วย QR PromptPay)

1. เข้าสู่ระบบด้วย LINE / Facebook / Google — โครงหน้าเว็บพร้อมแล้วใน `AuthForm.tsx` รอเขียน `/api/oauth/[provider]` + ใส่คีย์
2. คูปอง / โค้ดส่วนลด
3. รีเซ็ตรหัสผ่านเองได้ (ตอนนี้ต้องทักแชทให้ร้านตั้งให้)

## Deploy ขึ้น Netlify (step-by-step)
1. push โค้ดขึ้น GitHub (`git init && git add -A && git commit -m "init"` → สร้าง repo แล้ว push)
2. เข้า app.netlify.com → **Add new site → Import an existing project** → เลือก repo
3. Netlify อ่าน `netlify.toml` ให้เอง (build command `npm run build`) → กด **Deploy**
4. ตั้ง env variables ที่ Site settings → Environment variables (ค่าจาก `.env.example`)
5. ผูกโดเมน gucut.com ที่ Domain management
