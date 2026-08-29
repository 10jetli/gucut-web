"use client";

// ต่อคลิปแบบ HLS เข้ากับ <video>
//
// พารามิเตอร์ที่สาม (on) สำคัญมากกับฟีด — ฟีดวางกล่องคลิปไว้รอบตัวที่ดูอยู่หลายใบ
// ถ้าปล่อยให้ทุกใบต่อ HLS พร้อมกัน มันจะโหลดเซกเมนต์แข่งกัน 3-4 ใบ
// แย่งเน็ตกันเองจนใบที่ลูกค้ากำลังดูค้าง — ให้ส่ง on=true เฉพาะใบที่ต้องเล่นจริง
//   Safari (iPhone/Mac) เล่น .m3u8 ได้เองในตัว ใส่ src ตรง ๆ ได้เลย
//   Chrome / Android เล่นเองไม่ได้ ต้องพึ่ง hls.js — โหลดตอนใช้จริงเท่านั้น
//   คนใช้ iPhone (ลูกค้าส่วนใหญ่) จึงไม่ต้องโหลดไลบรารีนี้เลย
// ตอนยังใช้ไฟล์ mp4 ของ Shopify อยู่ (HOST = "") ฟังก์ชันนี้ไม่ทำอะไรทั้งนั้น
import { useEffect } from "react";
import { usingHls } from "./videos";

export function useHls(el: HTMLVideoElement | null, src: string, on = true) {
  useEffect(() => {
    if (!usingHls || !el || !on) return;
    if (isSafariHls()) return;   // Safari จัดการเองแล้ว

    let dead = false;
    let hls: { destroy(): void } | null = null;
    import("hls.js")
      .then(({ default: Hls }) => {
        if (dead || !Hls.isSupported()) return;
        const h = new Hls({
          // เก็บล่วงหน้ายาว ๆ แบบ TikTok — ยิ่ง buffer ยาว ยิ่งไม่สะดุดตอนเน็ตกระตุก
          //   maxBufferLength = เป้าหมายขั้นต่ำที่พยายามเก็บไว้ตลอด (วินาที)
          //   maxMaxBufferLength = เพดานสูงสุด (เน็ตดีเก็บได้ถึงเท่านี้)
          // buffer พอประมาณ — เก็บมากไปคือโหลดหนักตั้งแต่วินาทีแรก ทำให้ชิ้นแรกช้า
          maxBufferLength: 12,
          maxMaxBufferLength: 30,
          // ไม่ต้องเก็บของที่เล่นผ่านไปแล้วมาก — ประหยัดหน่วยความจำมือถือ
          backBufferLength: 6,
          // เลือกความคมชัดตามขนาดจอจริง มือถือจอเล็กก็ไม่ต้องโหลด 1080p ให้เปลืองเน็ต
          capLevelToPlayerSize: true,
          // ⚠️ เริ่มที่ชั้นต่ำสุด (480p) เสมอ — ชิ้นเล็ก โหลดไว "เล่นทันที" แบบ TikTok
          //    แล้วค่อยไต่คุณภาพขึ้นเองหลังเล่นแล้ว · เดิมตั้ง -1 ให้ ABR เลือก
          //    มันเดาเน็ตดีแล้วกระโดดไป 1080p (ชิ้นใหญ่) ตั้งแต่แรก = ชิ้นแรกช้า
          startLevel: 0,
          // ชิงโหลดชิ้นแรกของชั้นถัดไปไว้เลย ไม่ต้องรอให้ชิ้นปัจจุบันจบ
          startFragPrefetch: true,
          // เน็ตสะดุดชั่วคราวให้ลองโหลดชิ้นเดิมซ้ำหลายรอบก่อนยอมแพ้ (กันภาพค้าง)
          fragLoadingMaxRetry: 6,
          // เริ่มโหลดทันทีที่ต่อ ไม่รอเรียก startLoad เอง
          autoStartLoad: true,
        });
        // มือถือจอเล็ก ไม่ไต่ถึง 1080p เลย — 720p คมพอบนจอ 6 นิ้ว ชิ้นเล็กกว่าครึ่ง
        // = ไม่มีทางไปโหลด 1080p (ชิ้นใหญ่สุด) ที่ทำให้สะดุด
        if (window.innerWidth < 600) h.autoLevelCapping = 1;
        h.loadSource(src);
        h.attachMedia(el);
        hls = h;
      })
      .catch(() => {});   // โหลดไลบรารีไม่ได้ ปล่อยให้เบราว์เซอร์ลองเอง

    return () => {
      dead = true;
      el.pause();       // กันเสียงค้างเล่นต่อหลังเลื่อนผ่านไปแล้ว
      hls?.destroy();   // เลิกโหลดทันที ไม่ให้แย่งเน็ตกับใบที่กำลังดู
    };
  }, [el, src, on]);
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
