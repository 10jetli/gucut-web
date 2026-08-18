"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// แบนเนอร์หน้าแรก — เอารูปปกร้าน (ทรงจัตุรัส) มาผ่าครึ่ง
//   สไลด์ที่ 1 = ครึ่งบน  (โลโก้ NEW WAVE + เลื่อยแถวบน)
//   สไลด์ที่ 2 = ครึ่งล่าง (เลื่อยรุ่นใหญ่ + บาร์ + ใบอนุญาต)
// ผ่าด้วย Netlify Image CDN ตอนส่งให้ลูกค้า (fit=cover + position=top/bottom)
// ไม่ได้ตัดไฟล์ทิ้ง ใช้ไฟล์ต้นฉบับใบเดียว อยากปรับตำแหน่งแก้ตรงนี้ได้เลย
//
// ไฟล์เก็บไว้เองแล้วที่ public/img/ (ดึงมาจาก Shopify เมื่อ 15 ส.ค. 2569)
// ปิดร้าน Shopify เมื่อไหร่รูปปกก็ไม่หาย — เว็บไม่เหลืออะไรผูกกับ Shopify แล้ว
//
// ในร้าน Shopify มีรูปชุดนี้ 3 ไฟล์ — เลือกใบจัตุรัสตัวเล็กเพราะเบาสุดและคมพอ
//   all-Final.png                 5000 × 1791  ยาวแบน
//   all-Final_24a8f3a3….png       5000 × 5000  จัตุรัส
//   all-Final_24a8f3a3….webp      1500 × 1500  จัตุรัส ← ใช้ใบนี้
// (ไฟล์ที่ Shopify ตั้งชื่อว่า .webp จริง ๆ เป็น JPEG จึงเก็บเป็น .jpg
//  ถ้าเก็บเป็น .webp เบราว์เซอร์บางตัวจะอ่านไม่ออกเพราะชนิดไฟล์ไม่ตรงชื่อ)
// ---------------------------------------------------------------------------
const HERO = "/img/cover-all.jpg";

const HERO_W = 1500;              // ความกว้างไฟล์ต้นฉบับ
const HALF_H = 750;               // ครึ่งความสูง → แต่ละสไลด์เป็นทรง 2:1

// ความกว้างที่เตรียมไว้ให้เบราว์เซอร์เลือก — ไม่เกิน 1500 เพราะไฟล์ต้นฉบับกว้างเท่านั้น
// ขอใหญ่กว่านี้ = ให้ CDN ขยายรูปจนแตก ได้ไฟล์หนักขึ้นแต่ไม่ได้คมขึ้น
const WIDTHS = [640, 750, 828, 1080, 1200, 1500];

// สร้าง URL ผ่าน Netlify Image CDN — ย่อ + ครอปครึ่งบน/ครึ่งล่าง + แปลงฟอร์แมตให้เอง
function half(w: number, position: "top" | "bottom") {
  const p = new URLSearchParams({
    url: HERO,
    w: String(w),
    h: String(Math.round((w * HALF_H) / HERO_W)),
    fit: "cover",
    position,
    q: "60",     // รูปถ่ายฉากร้าน ลดคุณภาพลงหน่อยตาเปล่าดูไม่ออก แต่ไฟล์เบาลงราวหนึ่งในสาม
  });
  return `/.netlify/images?${p}`;
}

const slides = [
  {
    position: "top",
    alt: "โชว์รูมเลื่อยยนต์ NEWWAVE ของแท้ ร้าน GUCUT",
  },
  {
    position: "bottom",
    alt: "เลื่อยยนต์ NEWWAVE รุ่นใหญ่ พร้อมบาร์ Speed Bar Pro และใบอนุญาตค้าขายถูกต้อง",
  },
] as const;

export default function BannerSlider() {
  const [i, setI] = useState(0);

  // สลับภาพเองทุก 4 วิ
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="px-3 pt-2">
      <div
        className="relative overflow-hidden rounded-xl bg-carbon"
        style={{ aspectRatio: `${HERO_W} / ${HALF_H}` }}
      >
        {slides.map((s, idx) => {
          const shown = idx === i;
          return (
            <Link
              key={s.position}
              href="/categories/"
              aria-hidden={!shown}
              tabIndex={shown ? 0 : -1}
              className={`absolute inset-0 transition-opacity duration-700 ${
                shown ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            >
              {/* ใช้ img ตรง ๆ เพราะ next/image ส่งพารามิเตอร์ครอป (fit/position) ไม่ได้ */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={half(1080, s.position)}
                srcSet={WIDTHS.map((w) => `${half(w, s.position)} ${w}w`).join(", ")}
                // หน้าเว็บกว้างสุด max-w-lg (512px) หักขอบซ้ายขวาอย่างละ 12px
                sizes="(max-width: 536px) 100vw, 488px"
                alt={s.alt}
                width={HERO_W}
                height={HALF_H}
                // ใบแรกอยู่บนสุดของหน้า โหลดก่อนเพื่อนเพื่อให้หน้าแรกดูเร็ว
                fetchPriority={idx === 0 ? "high" : "auto"}
                className="h-full w-full object-cover"
              />
            </Link>
          );
        })}

        {/* จุดบอกตำแหน่งสไลด์ */}
        {/* ⚠️ จุดที่เห็นเล็กได้ แต่ "พื้นที่กด" ต้องไม่ต่ำกว่า 24×24 px
            เดิมปุ่มสูง 6px กว้าง 6px — นิ้วคนแตะไม่โดน และ Lighthouse หักคะแนน
            แก้ด้วยการครอบปุ่มให้ใหญ่แล้วใส่ padding โปร่ง จุดยังดูเล็กเท่าเดิม */}
        <div className="absolute bottom-0 right-1 flex">
          {slides.map((s, idx) => (
            <button
              key={s.position}
              onClick={() => setI(idx)}
              aria-label={`สไลด์ ${idx + 1}`}
              className="flex h-6 w-6 items-center justify-center"
            >
              <span
                className={`block h-1.5 rounded-full shadow transition-all ${
                  idx === i ? "w-4 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
