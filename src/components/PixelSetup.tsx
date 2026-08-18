"use client";

// ติดตั้งพิกเซลการตลาดตามที่ร้านตั้งไว้ในหลังร้าน
// อยู่ใน Shell จึงทำงานทุกหน้าของหน้าร้าน (ยกเว้นหลังร้าน — ไม่ควรถูกตามรอย)
//
// ===========================================================================
// ⚠️ ห้ามโหลดพิกเซลทันทีที่เปิดหน้า — วัดจริงแล้วมันคือตัวถ่วงหน้าเว็บอันดับหนึ่ง
//
// วัดด้วย Lighthouse บน gucut.com เมื่อ 18 ส.ค. 2569 (จำลองมือถือ + เน็ตช้า)
//   Facebook  225KB · ยึด CPU 371ms
//   Google    160KB · ยึด CPU 169ms
//   รวมสคริปต์คนอื่นเกือบ 400KB และกินเวลาประมวลผล 540ms
// ผลคือรูปแบนเนอร์โหลดเสร็จตั้งนานแล้ว แต่ "วาดไม่ออก" เพราะ CPU ไม่ว่าง
// (LCP 8.8 วิ โดย 89% เป็นช่วงรอวาด ไม่ใช่ช่วงดาวน์โหลด)
//
// จึงเลื่อนไปโหลดตอนเบราว์เซอร์ว่างจริง ๆ หรือตอนลูกค้าขยับตัวครั้งแรก
// อันไหนมาก่อนเอาอันนั้น แล้วยกเลิกอีกทางทิ้ง
//
// เสียอะไรไหม: PageView ถูกส่งช้าลงราว 1-3 วินาที ซึ่งไม่กระทบยอดเลย
// เพราะเหตุการณ์ที่ใช้คิดเงินจริง (AddToCart / InitiateCheckout / Purchase)
// เกิดหลังจากนั้นอยู่แล้ว และ Purchase ยังยิงซ้ำจากเซิร์ฟเวอร์ (CAPI) อีกทาง
//
// ⚠️ ถ้าจะเอากลับไปโหลดทันที ต้องวัดใหม่ก่อน — ของเดิมทำคะแนนความเร็วตกจริง
// ===========================================================================
import { useEffect } from "react";
import { initPixels } from "@/lib/track";

// กันเผื่อเบราว์เซอร์ว่างช้ามาก (หน้าหนัก/เครื่องช้า) — อย่างช้าที่สุดเท่านี้ต้องโหลด
const LATEST_MS = 4000;

export default function PixelSetup() {
  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      clean();
      void initPixels();
    };

    // ลูกค้าขยับตัว = หน้าวาดเสร็จแล้วแน่นอน โหลดได้เลยไม่ต้องรอ
    const EVENTS = ["scroll", "pointerdown", "keydown", "touchstart"] as const;
    const clean = () => {
      for (const e of EVENTS) window.removeEventListener(e, go);
      clearTimeout(timer);
    };
    for (const e of EVENTS) window.addEventListener(e, go, { passive: true, once: true });

    const timer = setTimeout(go, LATEST_MS);

    // requestIdleCallback = "โหลดตอนเบราว์เซอร์ไม่มีอะไรทำ" ซึ่งคือสิ่งที่เราต้องการเป๊ะ
    // Safari เพิ่งรองรับ จึงต้องเช็คก่อนใช้ ไม่งั้นหน้าพังบนเครื่องเก่า
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (ric) ric(go, { timeout: LATEST_MS });

    return clean;
  }, []);

  return null;
}
