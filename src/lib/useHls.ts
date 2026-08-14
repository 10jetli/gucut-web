"use client";

// ต่อคลิปแบบ HLS เข้ากับ <video>
//   Safari (iPhone/Mac) เล่น .m3u8 ได้เองในตัว ใส่ src ตรง ๆ ได้เลย
//   Chrome / Android เล่นเองไม่ได้ ต้องพึ่ง hls.js — โหลดตอนใช้จริงเท่านั้น
//   คนใช้ iPhone (ลูกค้าส่วนใหญ่) จึงไม่ต้องโหลดไลบรารีนี้เลย
// ตอนยังใช้ไฟล์ mp4 ของ Shopify อยู่ (HOST = "") ฟังก์ชันนี้ไม่ทำอะไรทั้งนั้น
import { useEffect } from "react";
import { usingHls } from "./videos";

export function useHls(el: HTMLVideoElement | null, src: string) {
  useEffect(() => {
    if (!usingHls || !el) return;
    if (el.canPlayType("application/vnd.apple.mpegurl")) return;   // Safari จัดการเองแล้ว

    let dead = false;
    let hls: { destroy(): void } | null = null;
    import("hls.js")
      .then(({ default: Hls }) => {
        if (dead || !Hls.isSupported()) return;
        const h = new Hls({ maxBufferLength: 12, capLevelToPlayerSize: true });
        h.loadSource(src);
        h.attachMedia(el);
        hls = h;
      })
      .catch(() => {});   // โหลดไลบรารีไม่ได้ ปล่อยให้เบราว์เซอร์ลองเอง

    return () => {
      dead = true;
      hls?.destroy();
    };
  }, [el, src]);
}

/** เบราว์เซอร์เล่น HLS ได้เองไหม (เรียกได้เฉพาะฝั่ง client) */
export const isSafariHls = () =>
  typeof document !== "undefined" &&
  !!document.createElement("video").canPlayType("application/vnd.apple.mpegurl");
