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
    if (isSafariHls()) return;   // Safari จัดการเองแล้ว

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

/** เบราว์เซอร์เล่น HLS เองได้จริงไหม (เรียกได้เฉพาะฝั่ง client)
 *
 * ⚠️ ห้ามเชื่อ canPlayType("application/vnd.apple.mpegurl") อย่างเดียวเด็ดขาด
 * Chrome บนคอมตอบว่า "maybe" ทั้งที่เล่นไม่ได้จริง — เคยทำให้คลิปทั้งหน้าค้าง
 * อยู่ที่รูปปก ไม่มี error ไม่มีอะไรเลย เพราะเราไม่โหลด hls.js ให้มัน
 * จึงต้องกันเบราว์เซอร์ตระกูล Chromium ออกไปด้วย เหลือแต่ WebKit จริง ๆ
 *
 * ห้ามกัน CriOS / FxiOS / EdgiOS (Chrome, Firefox, Edge บน iPhone) เด็ดขาด —
 * พวกนั้นเป็น WebKit ทั้งหมด เล่น HLS เองได้ และไม่มี MediaSource ให้ hls.js ใช้
 * ถ้าไปบังคับใช้ hls.js กับเครื่องพวกนี้ คลิปจะไม่ขึ้นเลย
 */
export const isSafariHls = () =>
  typeof document !== "undefined" &&
  !!document.createElement("video").canPlayType("application/vnd.apple.mpegurl") &&
  !/Chrome\/|Chromium|Edg\/|OPR\/|Android/i.test(navigator.userAgent);
