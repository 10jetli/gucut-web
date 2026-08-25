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

  // ต่อ hls.js ตอนลูกค้ากดเล่นจริงเท่านั้น — ต่อไว้ตั้งแต่เปิดหน้าคือดูดเน็ตทิ้งเปล่า
  const start = () => {
    if (playing) return;
    setPlaying(true);
    // ⚠️ Safari เล่น HLS ได้เอง แต่ต้องป้อน src ด้วย JS ใส่ใน JSX ไม่ได้
    //    หน้าถูก build เป็น HTML ล่วงหน้า ตอน build ไม่มีเบราว์เซอร์ ค่าจึงเป็น false เสมอ
    //    แล้ว iPhone จะได้ video ที่ไม่มี src ตลอดกาล (บทเรียนจากฟีดวิดีโอ)
    if (el && isSafariHls() && !el.src) el.src = videoSrc(CLIP);
  };

  return (
    <div ref={wrap} className="mt-3 overflow-hidden rounded-sm bg-carbon">
      {/*
        ⚠️ ใช้ปุ่มควบคุมของเบราว์เซอร์เอง ไม่ทำปุ่มเล่นเอง
           เคยทำปุ่มทับไว้ แต่ iOS วาดปุ่มของตัวเองทับอยู่ดี กลายเป็นสองชั้นซ้อนกัน
           (เห็นของจริงบนมือถือ 25 ส.ค. 2569) — ของเบราว์เซอร์มีเลื่อนถอยหลัง
           ปรับเสียง และส่งขึ้นทีวีได้ด้วย ดีกว่าที่ทำเองทุกทาง
        ⚠️ preload="none" กับไม่ใส่ autoPlay คือสิ่งที่กันไม่ให้คลิปเล่นเอง
           ห้ามถอดออก — คนเปิดหน้านี้มากรอกเอกสาร ไม่ได้มาดูคลิป
      */}
      <div className="relative aspect-square w-full">
        <video
          ref={ref}
          poster={videoPoster(CLIP)}
          playsInline
          controls
          preload="none"
          onPlay={start}
          className="h-full w-full object-contain"
        />
      </div>
    </div>
  );
}
