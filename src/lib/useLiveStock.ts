"use client";

// ดึงสต็อก/ราคาสดจาก ZORT ผ่าน /api/stock (Netlify Function)
// หน้าเว็บโชว์ตัวเลขที่อบไว้ก่อน แล้วสลับเป็นตัวเลขสดเมื่อได้คำตอบ — ไม่มีจังหวะหน้าว่าง
import { useEffect, useState } from "react";

export interface LiveStock {
  st: number; // สต็อกพร้อมขายจริง
  /**
   * ราคาขายปัจจุบัน — **เป็น null ได้** เมื่อต้นทางไม่ส่งราคามา
   *
   * 🔴 ของจริง 28 ก.ย. 2569: สินค้าที่มีทะเบียน (เลื่อย F660/F440/F288/F361)
   *    ดึงสต็อกจาก **คลังทะเบียน** ซึ่งตอบมาแค่ `{found, st, src:"licensed"}` — ไม่มี `p`
   *    เดิมชนิดข้อมูลเขียนว่า `p: number` แต่ค่าจริงเป็น `undefined`
   *    ⇒ `tsc` มองไม่เห็นเลย เพราะ JSON จาก fetch เป็น `any`
   *    ⇒ `<Price>` เรียก `value.toLocaleString()` บน undefined → **ทั้งหน้าสินค้าตาย**
   *    ลูกค้าเห็นหน้า "มีปัญหาชั่วคราว" แทนเลื่อยราคา 14,000–17,000 บาท 4 รุ่น
   *
   * 🔑 บทเรียน: ชนิดข้อมูลที่ประกาศไว้ **ไม่ใช่การตรวจ** ถ้าค่ามาจากนอกบ้าน
   *    ต้องตรวจตอนรับเข้าเสมอ — และตรงนี้คือจุดรับเข้า
   */
  p: number | null;
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
        // 🔑 จุดรับเข้าจากนอกบ้าน — ตรวจทีละช่อง ห้ามเชื่อว่ามีครบตามชนิดข้อมูล
        //    `d.p` หายได้จริง (ของมีทะเบียนตอบมาแค่ st) ⇒ แปลงเป็น null ตั้งแต่ตรงนี้
        //    ไม่ปล่อย undefined ไหลเข้าไปให้ปลายทางไปพังเอาเอง
        const v: LiveStock | null =
          d && d.found && typeof d.st === "number"
            ? { st: d.st, p: typeof d.p === "number" && Number.isFinite(d.p) ? d.p : null }
            : null;
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
  // ⚠️ ต้องเช็ค `live.p !== null` ก่อน — ไม่งั้น `null / refPrice` = 0 (ผ่านด่านไปแบบเงียบ)
  //    และถ้าเป็น undefined จะได้ NaN ซึ่ง **NaN > 2.5 กับ NaN < 0.4 เป็นเท็จทั้งคู่**
  //    ⇒ ด่านนี้เคยปล่อยผ่านทุกครั้งที่ไม่มีราคา ทั้งที่หน้าที่มันคือดักเคสราคาผิดปกติ
  if (live.p !== null && refPrice && refPrice > 0) {
    const ratio = live.p / refPrice;
    if (ratio > 2.5 || ratio < 0.4) return null;
  }

  // ไม่มีราคาสด ⇒ คืนราคาเว็บไปแทน (สต็อกยังสดอยู่ ใช้ได้)
  // ห้ามคืน null เฉย ๆ เพราะจะทำให้ "เช็คคลังแล้ว" หายไปทั้งที่สต็อกสดจริง
  return { st: Math.max(0, Math.floor(live.st)), p: live.p ?? refPrice ?? null };
}
