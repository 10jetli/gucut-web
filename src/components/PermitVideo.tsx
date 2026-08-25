"use client";

// คลิปอธิบายขั้นตอนขอใบอนุญาต — วางบนสุดของหน้า /permit/
//
// ⚠️ เจ้าของร้านสั่ง (25 ส.ค. 2569): "คุณไม่ต้องเขียนขั้นตอนอะไรเยอะ
//    ผมมีคลิปสรุปให้ลูกค้า ลูกค้าทุกคนดูแล้วเขาเข้าใจ"
//    ⇒ คลิปคือคำอธิบายหลัก ข้อความบนหน้าเป็นแค่ตัวเสริม
//    ห้ามเอาข้อความยาว ๆ กลับมาใส่แทนคลิป
//
// ⚠️ ไม่เล่นอัตโนมัติ ต้องกดเอง
//    หน้านี้คนเปิดตอนจะกรอกเอกสาร คลิปเด้งเสียงขึ้นมาเองคือรบกวน
//    และกินเน็ตลูกค้าที่ไม่ได้ตั้งใจจะดู
//
// ⚠️ ต่อ hls.js เฉพาะตอนกดเล่นแล้วเท่านั้น (eager = playing)
//    กติกาเดียวกับฟีดวิดีโอ — ต่อไว้ตั้งแต่เปิดหน้า = ดูดเน็ตทิ้งเปล่า

import { useCallback, useRef, useState } from "react";
import { useHls, isSafariHls } from "@/lib/useHls";
import { videoPoster, videoSrc, type ShopVideo } from "@/lib/videos";

/** คลิป "ขั้นตอนการขอใบอนุญาตให้มีเลื่อยโซ่ยนต์" — เจ้าของร้านเลือกเอง (คลิปที่ 349) */
const CLIP: ShopVideo = {
  v: "54509e8ae7ff42feb622bdf56cb3b22c",
  s: "SD-480p-1.5Mbps-41816239",
  hd: "HD-720p-4.5Mbps-41816239",
  pv: 1738246528,
  dur: 80,
  vw: 480,
  vh: 480,
} as ShopVideo;

export default function PermitVideo() {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // ⚠️ ref ต้องเป็นฟังก์ชันตัวเดิมทุกรอบ ไม่งั้น React ถอด/ใส่ ref ทุก render
  //    แล้วคลิปถูก reset รัว ๆ จนเล่นไม่ติดบนมือถือ (บทเรียนจากฟีดวิดีโอ)
  const ref = useCallback((node: HTMLVideoElement | null) => setEl(node), []);

  useHls(el, playing ? videoSrc(CLIP) : "", playing);

  const start = () => {
    setPlaying(true);
    // Safari เล่น HLS ได้เอง แต่ต้องป้อน src ด้วย JS
    // ⚠️ ใส่ src ใน JSX ไม่ได้ เพราะหน้าถูก build เป็น HTML ล่วงหน้า
    //    ตอน build ไม่มีเบราว์เซอร์ ค่าจึงเป็น false เสมอ แล้ว iPhone ได้ video ไร้ src
    setTimeout(() => {
      if (el && isSafariHls() && !el.src) el.src = videoSrc(CLIP);
      void el?.play().catch(() => { /* กดเล่นไม่ติดก็ไม่ต้องรบกวน */ });
    }, 0);
  };

  return (
    <div ref={wrap} className="mt-3 overflow-hidden rounded-sm bg-carbon">
      <div className="relative aspect-square w-full">
        <video
          ref={ref}
          poster={videoPoster(CLIP)}
          playsInline
          controls={playing}
          preload="none"
          className="h-full w-full object-contain"
        />
        {!playing && (
          <button
            onClick={start}
            aria-label="ดูคลิปอธิบายขั้นตอนขอใบอนุญาต"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/25"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95">
              <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-ink">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="rounded-full bg-black/55 px-3 py-1 text-[12.5px] font-medium text-white">
              ดูคลิปอธิบาย ๑ นาที ๒๐ วินาที
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
