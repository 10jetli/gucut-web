"use client";

// บอกร้านว่ามีคนเปิดหน้าที่ไม่มีอยู่ — ใช้หาว่า URL เก่าไหนยังมีคนกดอยู่
//
// ⚠️ ยิงครั้งเดียวตอนเปิดหน้า ไม่ได้ยิงซ้ำ
// ⚠️ ส่งแค่ที่อยู่หน้าที่หาไม่เจอกับลิงก์ต้นทาง ไม่ส่งข้อมูลส่วนตัวใด ๆ
import { useEffect } from "react";

export default function NotFoundBeacon() {
  useEffect(() => {
    try {
      const body = JSON.stringify({
        path: window.location.pathname,
        from: document.referrer ? new URL(document.referrer).host : "",
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/notfound", new Blob([body], { type: "application/json" }));
        return;
      }
      fetch("/api/notfound", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch { /* เบราว์เซอร์ไม่ยอมก็ข้ามไป */ }
  }, []);
  return null;
}
