"use client";

import { useEffect, useState } from "react";

// แบนเนอร์สไลด์อัตโนมัติทุก 4 วิ
const banners = [
  {
    title: "NEWWAVE 7800 SUPER-S",
    sub: "สุดยอดพลังการตัด งานหนักเอาอยู่",
    tag: "ส่งฟรีทั่วไทย",
    bg: "from-safety-dark via-safety to-amber-500",
  },
  {
    title: "โซ่ NEWWAVE Titanium 100%",
    sub: "คมนาน ทนกว่าเดิม เริ่มเพียง ฿360",
    tag: "ขายดีอันดับ 1",
    bg: "from-steel-700 via-steel-600 to-safety-dark",
  },
  {
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
      <div className="relative h-36 overflow-hidden rounded-xl">
        {banners.map((b, idx) => (
          <div
            key={idx}
            className={`absolute inset-0 flex flex-col justify-center bg-gradient-to-br px-5 transition-opacity duration-700 ${b.bg} ${
              idx === i ? "opacity-100" : "opacity-0"
            }`}
          >
            <span className="mb-1 w-fit rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-medium">
              {b.tag}
            </span>
            <h2 className="font-heading text-xl font-bold leading-tight drop-shadow">{b.title}</h2>
            <p className="mt-0.5 text-sm text-white/90">{b.sub}</p>
          </div>
        ))}
        {/* จุดบอกตำแหน่งสไลด์ */}
        <div className="absolute bottom-2 right-3 flex gap-1">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`สไลด์ ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                idx === i ? "w-4 bg-white" : "w-1.5 bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
