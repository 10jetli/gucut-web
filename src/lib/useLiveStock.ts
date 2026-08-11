"use client";

// ดึงสต็อก/ราคาสดจาก ZORT ผ่าน /api/stock (Netlify Function)
// หน้าเว็บโชว์ตัวเลขที่อบไว้ก่อน แล้วสลับเป็นตัวเลขสดเมื่อได้คำตอบ — ไม่มีจังหวะหน้าว่าง
import { useEffect, useState } from "react";

export interface LiveStock {
  st: number; // สต็อกพร้อมขายจริง
  p: number;  // ราคาขายปัจจุบัน
}

export interface LiveOptions {
  /** ราคาบนเว็บ ใช้กันเคสหน่วยไม่ตรงกัน */
  refPrice?: number;
  /**
   * โซ่แบบเส้น: ZORT เก็บเป็น "ข้อ" แต่เว็บขายเป็น "เส้น"
   * ใส่จำนวนข้อต่อเส้น (เช่น 22T = 22) แล้วระบบจะหารให้เป็นจำนวนเส้นที่ทำได้
   * กรณีนี้ใช้เฉพาะสต็อก — ไม่แตะราคา (ราคาขายมีค่าประกอบ ไม่ใช่ราคาข้อ × จำนวน)
   */
  perUnit?: number;
}

const memo = new Map<string, LiveStock | null>();

/** ดึงจำนวนฟัน/ข้อจากชื่อตัวเลือก เช่น '11.5" 22T ตัด' → 22 */
export function teethOf(variantTitle: string | undefined | null): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*T\b/i.exec(variantTitle || "");
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function useLiveStock(
  sku: string | null | undefined,
  opts: LiveOptions = {}
): LiveStock | null {
  const { refPrice, perUnit } = opts;

  // โซ่แบบเส้น: ถาม ZORT ด้วยรหัสฐาน (ตัดส่วนหลังขีดออก) เพราะ ZORT ไม่มี SKU รายเส้น
  const raw = sku?.trim() || null;
  const key = raw && perUnit ? raw.split("-")[0] : raw;

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
        if (alive) setLive(null);
      })
      .finally(() => void 0);
    return () => {
      alive = false;
    };
  }, [key]);

  if (!live) return null;

  // โซ่แบบเส้น: แปลงข้อ → จำนวนเส้นที่ทำได้ และคงราคาเว็บไว้
  if (perUnit) {
    return {
      st: Math.max(0, Math.floor(live.st / perUnit)),
      p: refPrice ?? live.p,
    };
  }

  // กันหน่วยไม่ตรงกัน: ราคาสดต่างจากราคาเว็บมากผิดปกติ → ไม่ใช้ตัวเลขสด
  if (refPrice && refPrice > 0) {
    const ratio = live.p / refPrice;
    if (ratio > 2.5 || ratio < 0.4) return null;
  }

  return { st: Math.max(0, Math.floor(live.st)), p: live.p };
}
