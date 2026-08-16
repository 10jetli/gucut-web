"use client";

// ติดตั้งพิกเซลการตลาดตามที่ร้านตั้งไว้ในหลังร้าน
// อยู่ใน Shell จึงทำงานทุกหน้าของหน้าร้าน (ยกเว้นหลังร้าน — ไม่ควรถูกตามรอย)
import { useEffect } from "react";
import { initPixels } from "@/lib/track";

export default function PixelSetup() {
  useEffect(() => { void initPixels(); }, []);
  return null;
}
