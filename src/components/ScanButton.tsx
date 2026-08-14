"use client";

// ปุ่มกล้องในช่องค้นหา — เปิดหน้าแสกนภาพหาสินค้า
// โหลดโค้ดหน้าแสกน (พร้อม tfjs) ตอนกดเท่านั้น ไม่ให้ไปถ่วงหน้าแรก
import dynamic from "next/dynamic";
import { useState } from "react";
import Portal from "./Portal";

const ScanSheet = dynamic(() => import("./ScanSheet"), { ssr: false });

export default function ScanButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="แสกนภาพหาสินค้า"
        className="-mr-0.5 shrink-0 p-0.5"
      >
        <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-none stroke-[#6b6b6b] stroke-[1.7]">
          <path d="M4 8V6.5A1.5 1.5 0 015.5 5H8M16 5h2.5A1.5 1.5 0 0120 6.5V8M20 16v1.5a1.5 1.5 0 01-1.5 1.5H16M8 19H5.5A1.5 1.5 0 014 17.5V16" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3.1" />
        </svg>
      </button>
      {/* ต้องผ่าน Portal — ไม่งั้นโดนเมนูล่างทับ (หัวเว็บ sticky z-40 กดชั้นซ้อนไว้) */}
      {open && (
        <Portal>
          <ScanSheet open={open} onClose={() => setOpen(false)} />
        </Portal>
      )}
    </>
  );
}
