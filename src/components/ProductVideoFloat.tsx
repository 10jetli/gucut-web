"use client";

// คลิปลอยมุมจอในหน้าสินค้า — แบบ Shopee
//
// ย่ออยู่มุมขวาล่างเหนือแถบซื้อ เล่นวนแบบปิดเสียง (เบราว์เซอร์อนุญาตให้เล่นเองได้
// เฉพาะตอนปิดเสียง) กดแล้วขยายเต็มจอพร้อมเปิดเสียง กดกากบาทเพื่อปิดทิ้ง
//
// โชว์เฉพาะสินค้าที่มีคลิปผูกไว้จริง (90 รายการ) ที่เหลือไม่ขึ้นอะไรเลย
import { useEffect, useRef, useState } from "react";
import { durLabel, usingHls, videoPoster, videoSrc, type ShopVideo } from "@/lib/videos";
import { isSafariHls, useHls } from "@/lib/useHls";
import Portal from "./Portal";

// ปิดไปแล้วไม่ต้องเด้งซ้ำระหว่างที่ยังเปิดเว็บอยู่ — แต่เปิดเว็บใหม่ให้เด้งได้อีก
const HIDE_KEY = "gucut-float-video-off";

export default function ProductVideoFloat({
  video,
  // ลอยสูงจากขอบล่างเท่าไหร่ — หน้าสินค้ามีแถบซื้อบัง (4.25rem)
  // หน้าแรกมีแค่เมนูล่าง จึงส่งค่าที่ต่ำกว่าเข้ามาแทน
  lift = "4.25rem",
}: {
  video: ShopVideo;
  lift?: string;
}) {
  const [gone, setGone] = useState(true);   // เริ่มด้วยซ่อนไว้ กัน HTML ฝั่ง server ไม่ตรงกับ client
  const [big, setBig] = useState(false);

  useEffect(() => {
    setGone(sessionStorage.getItem(HIDE_KEY) === "1");
  }, []);

  if (gone) return null;

  return (
    <>
      {/* ตัวย่อมุมจอ */}
      {/* ⚠️ ระยะลอยต้องใส่เป็น style ไม่ใช่ class ของ Tailwind
          Tailwind สแกนหาชื่อคลาสในซอร์สตอน build ถ้าประกอบชื่อคลาสจากตัวแปร
          มันจะหาไม่เจอแล้วไม่สร้าง CSS ให้ — กล่องจะไปกองอยู่ล่างสุดจอ */}
      <div
        style={{ bottom: `calc(env(safe-area-inset-bottom) + ${lift})` }}
        className="fixed right-2 z-[55] w-[104px] overflow-hidden rounded-lg bg-black shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
      >
        <button
          onClick={() => {
            sessionStorage.setItem(HIDE_KEY, "1");
            setGone(true);
          }}
          aria-label="ปิดคลิป"
          className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-[13px] leading-none text-white"
        >
          ×
        </button>
        <button
          onClick={() => setBig(true)}
          aria-label="ดูคลิปเต็มจอ"
          className="block w-full text-left"
        >
          <Clip video={video} muted className="aspect-[9/16] w-full object-cover" />
          <span className="flex items-center justify-center gap-1 bg-safety py-1 text-[11px] font-semibold text-white">
            วิดีโอ {durLabel(video.dur)}
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-white stroke-[2.5]">
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>

      {/* เต็มจอ พร้อมเสียง */}
      {big && (
        <Portal>
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black"
            onClick={() => setBig(false)}
          >
            <button
              onClick={() => setBig(false)}
              aria-label="ปิด"
              className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 p-2 text-2xl leading-none text-white"
            >
              ×
            </button>
            <div onClick={(e) => e.stopPropagation()} className="h-full w-full">
              <Clip video={video} controls className="h-full w-full object-contain" />
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

// <video> ที่ต่อ HLS ให้เรียบร้อย — ใช้ทั้งตัวย่อและตัวเต็มจอ
function Clip({
  video,
  muted,
  controls,
  className,
}: {
  video: ShopVideo;
  muted?: boolean;
  controls?: boolean;
  className: string;
}) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const src = videoSrc(video);
  useHls(el, src);
  const started = useRef(false);

  // ฝั่ง Safari ป้อน src ด้วย JS — ห้ามใส่ใน JSX
  // หน้านี้ถูก build เป็น HTML ล่วงหน้า ตอน build isSafariHls() เป็น false เสมอ
  // และ React ไม่แก้ attribute ที่ไม่ตรงกันตอน hydrate → iPhone ได้ <video> ไร้ src
  // (บั๊กเดียวกับที่ทำให้ฟีดวิดีโอค้างที่วงหมุน — แก้พร้อมกัน 16 ส.ค. 2569)
  useEffect(() => {
    if (!el) return;
    if (!(isSafariHls() || !usingHls)) return;
    if (el.getAttribute("src") !== src) {
      el.src = src;
      el.load();
    }
  }, [el, src]);

  // ตัวเต็มจอ: เปิดเสียงแล้วเล่นเลย — ถ้าเบราว์เซอร์ไม่ยอม (นโยบายเสียงอัตโนมัติ)
  // ก็ถอยไปเล่นแบบปิดเสียงแทน ดีกว่าจอค้างไม่เล่นอะไรเลย
  useEffect(() => {
    if (!el || started.current) return;
    started.current = true;
    el.play().catch(() => {
      el.muted = true;
      el.play().catch(() => {});
    });
  }, [el]);

  return (
    <video
      ref={setEl}
      poster={videoPoster(video, muted ? 240 : 720)}
      muted={muted}
      controls={controls}
      loop={muted}
      autoPlay
      playsInline
      preload="metadata"
      className={className}
    />
  );
}
