"use client";

// ลงทะเบียน service worker ให้ลูกค้าทุกคน
// เดิมลงทะเบียนเฉพาะหน้าหลังร้าน ลูกค้าทั่วไปจึงไม่ได้ประโยชน์อะไรเลย
// พอลงทะเบียนแล้ว: ติดตั้งเป็นแอปได้ · เปิดซ้ำเร็วขึ้น · เน็ตหลุดยังเปิดดูได้
import { useEffect } from "react";

export default function PwaSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // รอให้หน้าโหลดเสร็จก่อน จะได้ไม่แย่งแบนด์วิดท์กับรูปสินค้า
    const t = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* เบราว์เซอร์ไม่รองรับหรือปิดไว้ — เว็บยังใช้งานได้ปกติ ไม่ต้องทำอะไร */
      });
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return null;
}
