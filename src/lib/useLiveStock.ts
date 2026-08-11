"use client";

// ดึงสต็อก/ราคาสดจาก ZORT ผ่าน /api/stock (Netlify Function)
// หน้าเว็บโชว์ตัวเลขที่อบไว้ก่อน แล้วสลับเป็นตัวเลขสดเมื่อได้คำตอบ — ไม่มีจังหวะหน้าว่าง
import { useEffect, useState } from "react";

export interface LiveStock {
  st: number; // สต็อกพร้อมขายจริงในคลัง
  p: number;  // ราคาขายปัจจุบัน
}

// จำคำตอบไว้ระดับหน้า — เปิด sheet ซ้ำ/สลับตัวเลือกกลับมา ไม่ยิงซ้ำ
const memo = new Map<string, LiveStock | null>();

export function useLiveStock(
  sku: string | null | undefined,
  refPrice?: number
): LiveStock | null {
  const key = sku?.trim() || null;
  const [live, setLive] = useState<LiveStock | null>(key ? (memo.get(key) ?? null) : null);

  useEffect(() => {
    if (!key) {
      setLive(null);
      return;
    }
    if (memo.has(key)) {
      setLive(memo.get(key) ?? null);
      return;
    }
    let alive = true;
    fetch(`/api/stock?sku=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const v: LiveStock | null =
          d && d.found && typeof d.st === "number"
            ? { st: Math.max(0, Math.floor(d.st)), p: d.p }
            : null;
        memo.set(key, v);
        if (alive) setLive(v);
      })
      .catch(() => {
        // เน็ตล่ม/ยังไม่ตั้งค่า — ใช้ตัวเลขที่อบไว้ต่อ เงียบ ๆ
        if (alive) setLive(null);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  // กันหน่วยไม่ตรงกัน: ถ้าราคาสดต่างจากราคาบนเว็บเกิน 2.5 เท่า
  // (เช่น ZORT คิดต่อข้อ แต่เว็บขายต่อเส้น) — ไม่ใช้ตัวเลขสดเลย ปลอดภัยกว่า
  if (live && refPrice && refPrice > 0) {
    const ratio = live.p / refPrice;
    if (ratio > 2.5 || ratio < 0.4) return null;
  }
  return live;
}
