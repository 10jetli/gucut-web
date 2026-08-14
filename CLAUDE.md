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
- จานสี 4 สี: ส้มแดง `#FF3C00` · เข้ม `#333333` · เทาอ่อน `#ECECEC` · ขาว — ดู `tailwind.config.ts`
- ฟอนต์: ใช้ฟอนต์ระบบของเครื่องลูกค้า ไม่โหลดจากข้างนอก (ตัวหนังสือขึ้นตั้งแต่เฟรมแรก)
- PWA: `public/manifest.webmanifest` + `public/sw.js` + `public/icon-192.png`, `icon-512.png`
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
│   ├── layout.tsx            # โครงหลัก + Shell (เมนูล่าง ท้ายเว็บ ลงทะเบียน sw)
│   ├── page.tsx              # หน้าแรก: ค้นหา / แบนเนอร์ / Flash Sale / grid สินค้า
│   ├── products/[handle]/    # หน้าสินค้า (เวอร์ชันย่อ — ทำเต็มขั้นถัดไป)
│   ├── categories|videos|cart|account/  # หมวดหมู่ / วิดีโอ / ตะกร้า / บัญชี
│   └── offline/              # หน้าที่ขึ้นตอนเน็ตหลุด (service worker หยิบมาใช้)
├── components/               # SectionHead (หัวข้อประจำแบรนด์), SiteFooter, PwaSetup,
│                             # SearchBar, BannerSlider, FlashSale, ProductCard, BottomNav
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
- คลิปวิดีโอ 459 คลิป → `src/data/videos.json` (**ตัวไฟล์ .mp4 ยังอยู่บน Shopify CDN** ดูด้านล่าง)

สคริปต์ใน `scripts/` ที่มีชื่อ Shopify เป็นเครื่องมือ **ย้ายข้อมูลออกมาครั้งเดียว** ไม่ได้รันตอนเว็บทำงาน

> ⚠️ **ค้างอยู่จุดเดียว** — รูปปกหน้าแรกยังชี้ไปที่ `cdn.shopify.com`
> ดูตัวแปร `HERO` ใน `src/components/BannerSlider.tsx`
> เอาไฟล์มาวางที่ `public/img/cover-all.webp` แล้วแก้ `HERO` เป็น `/img/cover-all.webp` = จบ ไม่เหลือ Shopify แล้ว
> (ตัวแบนเนอร์ผ่ารูปจัตุรัสใบเดียวเป็นครึ่งบน/ครึ่งล่างด้วย Netlify Image CDN — ใช้กับไฟล์ในเครื่องได้เหมือนกัน)

> ⚠️ **คลิปวิดีโอ** — รายชื่อคลิปอยู่ในโปรเจกต์แล้ว (`src/data/videos.json`) แต่ **ตัวไฟล์ .mp4 ยังอยู่บน Shopify CDN**
> เอามาเก็บเองไม่ไหวเพราะ 459 คลิป รวม 588 นาที = หลาย GB (โปรเจกต์นี้มีรูปอยู่แล้ว 289MB)
> **แผนย้ายตัดสินใจแล้ว: Cloudflare R2 + HLS** (ปรับความคมชัดตามเน็ต · ใช้ได้ทั้งเว็บและแอป · ไม่คิดค่าโหลดออก)
> โค้ดพร้อมแล้วทั้งหมด เหลือแค่ย้ายไฟล์:
> 1. เจ้าของร้านเปิด R2 ที่ dash.cloudflare.com แล้วสร้าง bucket `gucut-video` (ต้องผูกบัตร)
> 2. รัน `node scripts/video-to-r2.mjs` บน Mac (วิธีเตรียมเครื่องอยู่หัวไฟล์ · รันซ้ำได้ ข้ามใบที่เสร็จแล้ว)
> 3. ผูกโดเมน `video.gucut.com` ให้ bucket
> 4. แก้ `HOST` ใน `src/lib/videos.ts` เป็น `https://video.gucut.com` = จบ ไม่เหลือ Shopify แล้ว
>
> ตัวเล่นรองรับทั้ง mp4 (Shopify) และ HLS (R2) อยู่แล้ว สลับด้วยค่า `HOST` ค่าเดียว
> Safari เล่น HLS ได้เอง · Chrome/Android โหลด `hls.js` ตอนใช้จริงเท่านั้น (ไม่ติดไปกับ bundle หลัก)

**ตามหาคลิปเพิ่ม — ค้นมาหมดแล้ว อย่าเสียเวลาค้นซ้ำ**
เจ้าของร้านบอกว่าแอป Vizup มีคลิปแนวตั้งราว 500 ใบ แต่ในมือเรามี 347 ใบ ที่หายไปอยู่ในแอป Vizup เอง
ค้นมาแล้วทุกทาง ไม่เจอที่อื่นอีก:
- Shopify Files (bulk ทั้ง 7,260 ไฟล์) → วิดีโอ 562 ใบ · ยาว ≥5 วิ 459 ใบ · แนวตั้ง 347 ใบ
- media ที่ติดกับสินค้า 113 รายการ → เป็นชุดเดียวกับใน Files ทั้งหมด ไม่มีใบใหม่
- GenericFile 396 ไฟล์ → Vizup อัปแต่ **รูป** .avif 330 ใบ ไม่มีวิดีโอ
- shop metafield `vizup.videos` → เป็นแค่รายชื่อ hash ที่ mirror มาจาก Shopify Files (ชุดเดิม)
- Cloudflare Worker `gucut-pwa` → โค้ดที่ deploy อยู่ **ไม่มี route `/vizup-api/` แล้ว** (เหลือแต่ auth + pwa-api)
  ถึงแม้ `snippets/vizup-popup.liquid` ในธีมเก่าจะยังอ้างถึงอยู่
- metaobject / metafield ของสินค้า / app embed ในธีมหลัก → ไม่มีข้อมูลผูกคลิป-สินค้าของ Vizup

จะได้คลิปที่เหลือต้องให้ Vizup ดันเข้า Shopify Files ก่อน แล้วรัน `scripts/gen-videos.mjs` ใหม่

## สถานะ Phase 1 — ครบแล้ว ✅
- [x] หน้าแรก feed สไตล์ Shopee (แบนเนอร์ / Flash Sale countdown / grid สินค้า)
- [x] หน้าสินค้าเต็ม: รูปสไลด์ / variant / ปุ่มวิดีโอ / สเปกตาราง / ปุ่มซื้อติดล่างจอ
- [x] ตะกร้า localStorage + badge ที่ bottom nav
- [x] เช็คเอาต์: ฟอร์มที่อยู่ → QR PromptPay (gen เองใน `lib/promptpay.ts`) → แนบสลิป → POST `NEXT_PUBLIC_ORDER_WEBHOOK_URL`
- [x] หน้าวิดีโอ feed แนวตั้ง — คลิปจริง 459 คลิป (91 คลิปผูกกับสินค้า กดซื้อจากคลิปได้)
      คลิปมาจากหลายแอปคนละยุค: **vizup 244** (ที่ร้านใช้อยู่) · gracias 122 · reelup 1 · อัปกับสินค้าตรง ๆ 92
      ฟีดเรียง ผูกสินค้า → vizup → ที่เหลือ · อยากซ่อนของแอปไหนใส่ที่ `HIDE` ใน `src/lib/videos.ts`
- [x] หมวดหมู่ + ตัวกรองราคา

## สิ่งที่เจ้าของร้านต้องใส่ก่อนเปิดใช้จริง
1. `NEXT_PUBLIC_PROMPTPAY_ID` — เบอร์ PromptPay รับเงิน
2. `NEXT_PUBLIC_ORDER_WEBHOOK_URL` — webhook จาก Make.com
3. ตัวเลข "ขายแล้ว" และราคาก่อนลดจริงใน `src/lib/catalog.ts`

## Phase 2
> **ตัดสินใจแล้ว: เลิกใช้ Shopify** — ห้ามเสนอให้ต่อ Storefront API หรือย้ายกลับไป Shopify
> เว็บนี้ยืนด้วยตัวเองครบแล้ว (สินค้า/รูป/รีวิวอยู่ในโปรเจกต์ · สต็อกจาก ZORT · สมาชิกเก็บที่ Netlify Blobs · เก็บเงินด้วย QR PromptPay)

1. **เข้าสู่ระบบด้วย LINE / Facebook / Google — เขียนเสร็จแล้ว**
   ทางเดินกลางอยู่ที่ `netlify/lib/oauth.mjs` · แต่ละเจ้าเป็นไฟล์บาง ๆ ใน `netlify/functions/oauth-*.mjs`
   รอแค่ใส่คีย์ที่ Netlify แล้วเปิดทีละเจ้าด้วย env (ดู `.env.example`)
   ลูกค้าใหม่กดปุ่ม → กรอกเบอร์ครั้งเดียวที่ `/account/link/` → ครั้งต่อไปกดปุ่มเดียวเข้าเลย
   บัญชียังผูกกับ **เบอร์โทร** เป็นหลักเหมือนเดิม ออร์เดอร์เก่าจึงตามมาครบ
   หนึ่งเบอร์ผูกได้หลายเจ้าพร้อมกัน (เก็บใน `u.social`)

   **เพิ่มเจ้าใหม่**: เขียน object ใน `lib/oauth.mjs` แบบเดียวกับ `LINE`/`FACEBOOK`/`GOOGLE`
   (ต้องมี `authorizeUrl` กับ `getProfile`) แล้วสร้างไฟล์ `oauth-<เจ้า>.mjs` 3 บรรทัด
   เรื่อง state / cookie / กัน open redirect ตัวกลางจัดการให้หมดแล้ว
2. คูปอง / โค้ดส่วนลด
3. รีเซ็ตรหัสผ่านเองได้ (ตอนนี้ต้องทักแชทให้ร้านตั้งให้)
4. หน้า นโยบายความเป็นส่วนตัว / เงื่อนไขการใช้บริการ
   (Meta กับ Google บังคับตอนขอเปิดใช้จริง · ตอนนี้ลิงก์ท้ายหน้า login ชี้ `/account/` ชั่วคราว)

## ระบบหลังร้าน
อยู่ที่ **new78.com/admin/**

> 🚫 **ห้ามแตะโดเมน `admin.new78.com`** — เป็นของ Netlify project คนละตัว (`gucut-admin`)
> ที่เจ้าของร้าน **ใช้งานจริงอยู่ตอนนี้** ย้ายมาเมื่อไหร่ของเดิมล่มทันที
>
> ใน `netlify.toml` มีกติกาเปลี่ยนเส้นทางสำหรับโดเมนนี้เตรียมไว้แล้ว แต่ **ยังไม่ทำงาน**
> (โดเมนไม่ได้ผูกกับ project นี้) ถ้าวันหนึ่งเจ้าของร้านอยากย้ายจริง ค่อยเปิดใช้
> หรือจะเปลี่ยนไปใช้ชื่ออื่นก็แก้แค่ชื่อโดเมนในไฟล์นั้น

**ด่านตรวจรหัสอยู่ที่ `netlify/lib/admin-gate.mjs` ที่เดียว** — API หลังร้านทุกตัวต้องเรียกผ่านตัวนี้
ห้ามเทียบ `CHAT_ADMIN_KEY` เองในไฟล์ฟังก์ชัน ไม่งั้นจะไม่มีตัวกันเดารหัสรัว ๆ
- ใส่รหัสผิดเกิน 5 ครั้ง (นับแยกตาม IP) พักไว้ 15 นาที
- เทียบรหัสแบบใช้เวลาเท่ากันเสมอ (`timingSafeEqual`)
- เครื่องลูกค้าจำรหัสไว้ 30 วันแล้วต้องใส่ใหม่ (`src/lib/admin.ts`)
- ⚠️ ตั้ง `CHAT_ADMIN_KEY` เป็นตัวอักษรอังกฤษ/ตัวเลขเท่านั้น — header ส่งภาษาไทยไม่ได้

## ทำเป็นแอปในอนาคต — ออกแบบเผื่อไว้แล้ว
เว็บนี้เป็น **PWA** ตั้งแต่ต้น ลูกค้ากด "เพิ่มลงหน้าจอโฮม" ได้เลย ไม่ต้องผ่านสโตร์

ของที่พร้อมแล้ว
- `public/manifest.webmanifest` — ชื่อ ไอคอน สีแถบ ทางลัด (หมวดหมู่ / ตะกร้า / คำสั่งซื้อ)
- `public/sw.js` — แคชไฟล์ให้เปิดได้ตอนเน็ตหลุด + รับ push
- `src/components/PwaSetup.tsx` — ลงทะเบียน service worker ให้ลูกค้าทุกคน
- `src/app/offline/page.tsx` — หน้าที่ขึ้นแทนจอขาวตอนไม่มีเน็ต
- ระยะหลบขอบจอ (`env(safe-area-inset-bottom)`) ที่เมนูล่างและแถบซื้อ

**กฎการแคชใน sw.js — อย่าแก้มั่ว**
- `/api/*` ห้ามแคชเด็ดขาด (ล็อกอิน สต็อก ราคา ต้องสด)
- หน้าเว็บ = ขอเน็ตก่อน ไม่ได้ค่อยใช้ของเก่า → deploy แล้วลูกค้าเห็นทันที
- ไฟล์ใน `/_next/static/`, `/img/`, `/rv/` = ใช้ของเก่าก่อน (ชื่อมี hash อยู่แล้ว)
- ขึ้นเวอร์ชันที่ตัวแปร `VERSION` เมื่อแก้กติกาแคช ของเก่าจะถูกลบให้เอง

ถ้าวันหนึ่งอยากขึ้น App Store / Play Store
- **Play Store**: ห่อด้วย TWA (Bubblewrap) ใช้เว็บเดิมทั้งหมด ไม่ต้องเขียนใหม่
- **App Store**: ห่อด้วย Capacitor — ต้องแก้เรื่องเดียวคือ **session cookie**
  ตอนนี้ใช้ cookie แบบ HttpOnly (`gu_sess`) ซึ่งดีที่สุดสำหรับเว็บ
  ถ้าทำแอปเนทีฟจริง ให้เพิ่มทางเลือกรับ token ผ่าน header ที่ `netlify/lib/session.mjs`
  ไม่ต้องรื้อของเดิม เพิ่มเป็นทางที่สองได้เลย
- API แยกจากหน้าเว็บอยู่แล้ว (`/api/auth`, `/api/stock`, `/api/oauth/*`) แอปเรียกใช้ชุดเดียวกันได้

## Deploy ขึ้น Netlify (step-by-step)
1. push โค้ดขึ้น GitHub (`git init && git add -A && git commit -m "init"` → สร้าง repo แล้ว push)
2. เข้า app.netlify.com → **Add new site → Import an existing project** → เลือก repo
3. Netlify อ่าน `netlify.toml` ให้เอง (build command `npm run build`) → กด **Deploy**
4. ตั้ง env variables ที่ Site settings → Environment variables (ค่าจาก `.env.example`)
5. ผูกโดเมน gucut.com ที่ Domain management
