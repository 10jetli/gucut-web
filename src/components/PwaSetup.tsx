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
    // นับ "กดติดตั้งแอป" — เบราว์เซอร์ยิง appinstalled ตอนติดตั้งสำเร็จ (Android/คอม
    // เท่านั้น iPhone ไม่มี event นี้ — ฝั่ง iPhone วัดจากการเปิดใช้จริงใน LiveBeacon แทน)
    const onInstalled = () => {
      try {
        const vid = sessionStorage.getItem("gu_vid") || "";
        const body = JSON.stringify({ vid: vid || `pwa-${Date.now().toString(36)}`, path: "/", install: 1 });
        if (navigator.sendBeacon) navigator.sendBeacon("/api/live", new Blob([body], { type: "application/json" }));
        else void fetch("/api/live", { method: "POST", body, keepalive: true });
      } catch { /* นับพลาดไม่เป็นไร */ }
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => { clearTimeout(t); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  return null;
}
