"use client";

// บอกเซิร์ฟเวอร์ว่ามีคนเปิดหน้านี้ — ใช้นับ "ออนไลน์ตอนนี้" ในหลังร้าน
//
// ไม่ใช้คุกกี้ ใช้ sessionStorage เก็บรหัสสุ่มไว้ชั่วคราว ปิดแท็บก็หาย
// รหัสนี้บอกได้แค่ว่า "เป็นคนเดิมในแท็บนี้" ผูกกับตัวตนจริงไม่ได้เลย
//
// ยิงตอนเปลี่ยนหน้าเท่านั้น ไม่ได้ยิงเป็นจังหวะ — คนที่เปิดค้างไว้เกิน 5 นาที
// โดยไม่แตะอะไรจะหลุดจากตัวเลข "ออนไลน์ตอนนี้" ซึ่งตั้งใจให้เป็นแบบนั้น
// (นับคนที่กำลังใช้งานจริง ไม่ใช่คนที่ลืมปิดแท็บ)
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const KEY = "gu_vid";

function visitorId() {
  try {
    let v = sessionStorage.getItem(KEY);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return "";   // เบราว์เซอร์ปิด storage — ไม่นับ ดีกว่าพัง
  }
}

export default function LiveBeacon() {
  const path = usePathname() || "/";
  useEffect(() => {
    const vid = visitorId();
    if (!vid) return;
    const body = JSON.stringify({ vid, path });
    // sendBeacon ส่งได้แม้ลูกค้ากำลังปิดหน้า และไม่หน่วงการโหลดหน้าถัดไป
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/live", new Blob([body], { type: "application/json" }));
        return;
      }
    } catch { /* ตกไปใช้ fetch */ }
    fetch("/api/live", { method: "POST", body, keepalive: true, credentials: "omit" }).catch(() => {});
  }, [path]);
  return null;
}
