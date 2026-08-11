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

export function useLiveStock(sku: string | null | undefined): LiveStock | null {
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
          d && d.found && typeof d.st === "number" ? { st: d.st, p: d.p } : null;
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

  return live;
}
