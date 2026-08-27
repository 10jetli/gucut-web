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
const SRC_SENT = "gu_src";

// พารามิเตอร์ที่บอกช่องทางได้ — เอาแค่ที่จำเป็น ไม่กวาดทั้ง URL
const SRC_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign",
  "gclid", "gbraid", "wbraid", "fbclid", "ttclid", "msclkid",
];

/**
 * ช่องทางที่ลูกค้าเข้ามา — ส่งครั้งเดียวต่อการเข้าเว็บหนึ่งรอบ
 *
 * ⚠️ ส่งแค่ "ชื่อโดเมน" ของเว็บที่ส่งมา ไม่ส่งลิงก์เต็ม
 *    ลิงก์เต็มของเว็บอื่นอาจมีคำค้นหรือรหัสผู้ใช้ของลูกค้าติดมาโดยไม่ตั้งใจ
 *    เราไม่ต้องการข้อมูลนั้นและไม่ควรเก็บ — รู้แค่ว่ามาจาก Google หรือ Facebook ก็พอ
 *
 * ⚠️ ส่งเฉพาะหน้าแรกที่เปิด เพราะหน้าถัดไปต้นทางจะเป็นเว็บเราเอง ไม่มีความหมาย
 */
function entrySource() {
  try {
    if (sessionStorage.getItem(SRC_SENT)) return undefined;
    sessionStorage.setItem(SRC_SENT, "1");

    let h = "";
    try { h = document.referrer ? new URL(document.referrer).hostname : ""; } catch { h = ""; }

    const q: Record<string, string> = {};
    const sp = new URLSearchParams(window.location.search);
    for (const k of SRC_PARAMS) {
      const v = sp.get(k);
      if (v) q[k] = v.slice(0, 60);
    }
    return { h, q };
  } catch {
    return undefined;   // เบราว์เซอร์ปิด storage — ไม่ต้องส่ง ดีกว่าพัง
  }
}

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
    // เปิดจากไอคอน PWA ที่ติดตั้งไว้ไหม — iPhone ใช้ navigator.standalone
    let pwa = 0;
    try {
      pwa = window.matchMedia?.("(display-mode: standalone)")?.matches ||
            (navigator as unknown as { standalone?: boolean }).standalone === true ? 1 : 0;
    } catch { /* ตรวจไม่ได้ = ไม่นับ */ }
    const body = JSON.stringify({ vid, path, src: entrySource(), pwa });
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
