# GUCUT Storefront

เว็บขายเลื่อยยนต์ NEWWAVE / KingKong ของร้าน GUCUT (gucut.com) — สไตล์ Shopee + TikTok Shop, mobile-first, ภาษาไทย, ราคาบาท

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
    ├── products.ts           # ข้อมูลสินค้า snapshot จาก Shopify จริง (ก.ค. 2026)
    └── shopify.ts            # layer Storefront API — สลับ mock/จริงตาม .env อัตโนมัติ
```

## ข้อมูลสินค้า
`lib/products.ts` เป็น snapshot จากร้าน Shopify จริง: ชื่อ ราคา รูป (Shopify CDN) และ product GID เป็นของจริง
**หมายเหตุ:** ยอดขาย (`sold`) และราคาก่อนลด (`compareAtPrice`) เป็นตัวเลขตัวอย่างสำหรับ demo — แก้ให้ตรงจริงได้ในไฟล์นี้

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
4. ตัวเลข "ขายแล้ว" และราคาก่อนลดจริงใน `src/lib/products.ts`

## Phase 2
1. **ต่อ Shopify จริง**: สร้าง Storefront access token (Shopify admin → Settings → Apps → Develop apps) → ใส่ใน `.env` ตาม `.env.example` → `lib/shopify.ts` จะดึงข้อมูลสดเองอัตโนมัติ (ลดแผนเหลือ Basic ได้ ไม่กระทบ API)
2. ระบบสมาชิก
3. คูปอง / โค้ดส่วนลด

## Deploy ขึ้น Netlify (step-by-step)
1. push โค้ดขึ้น GitHub (`git init && git add -A && git commit -m "init"` → สร้าง repo แล้ว push)
2. เข้า app.netlify.com → **Add new site → Import an existing project** → เลือก repo
3. Netlify อ่าน `netlify.toml` ให้เอง (build command `npm run build`) → กด **Deploy**
4. ตั้ง env variables ที่ Site settings → Environment variables (ค่าจาก `.env.example`)
5. ผูกโดเมน gucut.com ที่ Domain management
