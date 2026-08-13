"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// รูปปกหน้าแรก — ไฟล์ all-Final.png (5000×1791) ที่ใช้เป็นปกร้าน Shopify เดิม
//
// ตอนนี้ยังชี้ไปที่ CDN ของ Shopify "ชั่วคราว" เพราะเครื่องที่ผมใช้ทำงาน
// โหลดไฟล์จากเว็บภายนอกไม่ได้ (โดนนโยบายเครือข่ายบล็อก HTTP 403)
//
// ⚠️ ย้ายมาเก็บเองเมื่อไหร่ก็ได้ แก้แค่บรรทัดเดียว:
//    1) วางไฟล์ไว้ที่  public/img/cover-all.png
//    2) เปลี่ยน HERO ข้างล่างเป็น  "/img/cover-all.png"
// แล้วเว็บจะเลิกพึ่ง Shopify ทันที (ปิดร้าน Shopify แล้วปกไม่หาย)
// ---------------------------------------------------------------------------
const HERO = "https://cdn.shopify.com/s/files/1/0905/1081/9620/files/all-Final.png?v=1728437874";

// สัดส่วนรูปจริง 5000 × 1791 — ล็อกกรอบตามนี้ รูปจะไม่โดนตัดหัวตัดท้าย
const HERO_RATIO = "5000 / 1791";

type Slide =
  | { kind: "img"; src: string; alt: string; href: string }
  | { kind: "text"; title: string; sub: string; tag: string; bg: string };

// แบนเนอร์สไลด์อัตโนมัติทุก 4 วิ — ใบแรกคือรูปปกจริงของร้าน
const banners: Slide[] = [
  {
    kind: "img",
    src: HERO,
    alt: "GUCUT — เลื่อยยนต์ NEWWAVE / KingKong ของแท้ พร้อมโซ่ บาร์ อะไหล่ครบทุกรุ่น",
    href: "/categories/",
  },
  {
    kind: "text",
    title: "โซ่ NEWWAVE Titanium 100%",
    sub: "คมนาน ทนกว่าเดิม เริ่มเพียง ฿360",
    tag: "ขายดีอันดับ 1",
    bg: "from-steel-700 via-steel-600 to-safety-dark",
  },
  {
    kind: "text",
    title: "ชมรีวิวจริงจากช่อง NEWWAVE Legends",
    sub: "ทุกรุ่นมีคลิปทดสอบให้ดูก่อนซื้อ",
    tag: "YouTube",
    bg: "from-red-700 via-red-600 to-safety",
  },
];

export default function BannerSlider() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="px-3 pt-2">
      <div
        className="relative overflow-hidden rounded-xl bg-steel-700"
        style={{ aspectRatio: HERO_RATIO }}
      >
        {banners.map((b, idx) => {
          const shown = idx === i;
          const layer = `absolute inset-0 transition-opacity duration-700 ${
            shown ? "opacity-100" : "pointer-events-none opacity-0"
          }`;

          if (b.kind === "img") {
            return (
              <Link key={idx} href={b.href} className={layer} aria-hidden={!shown} tabIndex={shown ? 0 : -1}>
                <Image
                  src={b.src}
                  alt={b.alt}
                  fill
                  // หน้าเว็บกว้างสุด max-w-lg (512px) หักขอบซ้ายขวาอย่างละ 12px
                  sizes="(max-width: 536px) 100vw, 488px"
                  className="object-cover"
                  // ใบแรกอยู่บนสุดของหน้า โหลดก่อนเพื่อนเพื่อให้หน้าแรกดูเร็ว
                  priority
                />
              </Link>
            );
          }

          return (
            <div
              key={idx}
              className={`${layer} flex flex-col justify-center bg-gradient-to-br px-5 ${b.bg}`}
              aria-hidden={!shown}
            >
              <span className="mb-1 w-fit rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-medium">
                {b.tag}
              </span>
              <h2 className="font-heading text-xl font-bold leading-tight drop-shadow">{b.title}</h2>
              <p className="mt-0.5 text-sm text-white/90">{b.sub}</p>
            </div>
          );
        })}

        {/* จุดบอกตำแหน่งสไลด์ */}
        <div className="absolute bottom-2 right-3 flex gap-1">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`สไลด์ ${idx + 1}`}
              className={`h-1.5 rounded-full shadow transition-all ${
                idx === i ? "w-4 bg-white" : "w-1.5 bg-white/60"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
