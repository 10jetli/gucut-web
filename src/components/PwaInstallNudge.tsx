"use client";

// แบนเนอร์ชวนติดตั้งแอป — เจ้าของร้านสั่ง "PWA แจ้งเตือนวันละครั้ง" (27 ส.ค. 2569
// เลือกความหมาย "ชวนติดตั้งแอปวันละครั้ง" จากตัวเลือกที่ถามกลับ)
//
// กติกาที่ห้ามหย่อน — ลูกค้าเป็นชาวบ้าน ไม่เก่งเทคโนโลยี และเกลียดป้ายกวนใจ
// - โผล่ได้ **วันละไม่เกิน 1 ครั้ง** ไม่ว่าลูกค้าจะกดปิดหรือเมินเฉย (จดวันที่ไว้ในเครื่อง)
// - ติดตั้งแล้ว (เปิดแบบ standalone) ไม่โผล่อีกเลย
// - อยู่ในเบราว์เซอร์ของแอปอื่น (LINE/Facebook) ไม่โผล่ — ติดตั้งจากตรงนั้นไม่ได้จริง
// - โผล่ช้า ๆ หลังหน้าโหลด (6 วิ) ไม่บังตอนกำลังเลือกซื้อของแรก ๆ
// - Android/คอม: ปุ่ม "ติดตั้ง" กดแล้วขึ้นกล่องติดตั้งของเบราว์เซอร์เอง
//   iPhone: ไม่มีทางสั่งติดตั้งจากโค้ด — บอกวิธี 2 ขั้นแบบภาษาชาวบ้านแทน

import { useEffect, useState } from "react";

const KEY = "gu-pwa-nudge"; // เก็บวันที่โผล่ล่าสุด (YYYY-MM-DD ตามเครื่องลูกค้า)

type BipEvent = Event & { prompt: () => Promise<void> };

export default function PwaInstallNudge() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [bip, setBip] = useState<BipEvent | null>(null);

  useEffect(() => {
    try {
      const standalone =
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (standalone) return;                       // ติดตั้งแล้ว
      const ua = navigator.userAgent;
      if (/\bLine\/|FBAN|FBAV|Instagram/i.test(ua)) return;  // เบราว์เซอร์ในแอปอื่น
      const today = new Date().toLocaleDateString("sv-SE");  // YYYY-MM-DD
      if (localStorage.getItem(KEY) === today) return;       // วันนี้โผล่ไปแล้ว

      const isIos = /iPhone|iPad|iPod/.test(ua);
      setIos(isIos);

      // Android/คอม: รอสัญญาณติดตั้งได้จากเบราว์เซอร์ก่อนค่อยโผล่ (กันปุ่มกดแล้วเงียบ)
      const onBip = (e: Event) => {
        e.preventDefault();
        setBip(e as BipEvent);
      };
      window.addEventListener("beforeinstallprompt", onBip);

      const t = setTimeout(() => {
        // iPhone โผล่ได้เลย (โชว์วิธีทำ) · เครื่องอื่นโผล่เฉพาะเมื่อติดตั้งได้จริง
        setShow(true);
        try { localStorage.setItem(KEY, today); } catch { /* โหมดส่วนตัว */ }
      }, 6000);
      return () => { clearTimeout(t); window.removeEventListener("beforeinstallprompt", onBip); };
    } catch { /* ตรวจไม่ได้ = ไม่โผล่ ดีกว่าพัง */ }
  }, []);

  if (!show || (!ios && !bip)) return null;

  return (
    // เจ้าของร้านสั่ง "ให้โผล่ด้านบน" (28 ส.ค. 2569) — ลอยใต้ขอบบนจอ เคารพติ่งกล้อง
    <div className="fixed inset-x-2 z-40 rounded-xl bg-ink p-3 text-white shadow-lg"
         style={{ top: "calc(8px + env(safe-area-inset-top))" }}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white font-heading text-[18px] font-extrabold italic text-safety">G</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold">ติดเว็บไว้ที่หน้าจอ เปิดง่ายเหมือนแอป</p>
          {ios ? (
            <p className="mt-0.5 text-[12px] leading-relaxed text-white/75">
              กดปุ่มแชร์ <span className="rounded bg-white/15 px-1">⎋</span> ด้านล่าง
              แล้วเลือก <b className="text-white">&ldquo;เพิ่มลงหน้าจอโฮม&rdquo;</b>
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] leading-relaxed text-white/75">
              เข้าซ้ำได้ในกดเดียว ไม่ต้องพิมพ์ชื่อเว็บ · แจ้งเตือนสถานะออเดอร์ก็เด้งถึงเครื่อง
            </p>
          )}
        </div>
        <button aria-label="ปิด" onClick={() => setShow(false)}
                className="shrink-0 p-1 text-[18px] leading-none text-white/60">×</button>
      </div>
      {!ios && bip && (
        <button
          onClick={() => { void bip.prompt().catch(() => {}); setShow(false); }}
          className="mt-2.5 w-full rounded-lg bg-safety-light py-2.5 text-[14px] font-bold text-ink"
        >
          ติดตั้งเลย
        </button>
      )}
    </div>
  );
}
