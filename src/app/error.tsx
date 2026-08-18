"use client";

// ตาข่ายกันหน้าขาว — โค้ดพังตรงไหนก็ตาม ลูกค้าได้เห็นหน้านี้แทนจอเปล่า
//
// ⚠️ ทำไมต้องมี: Next.js เจอ error ระหว่างวาดหน้าแล้วจะโยนทั้งหน้าทิ้ง
//    ขึ้นข้อความอังกฤษ "Application error: a client-side exception has occurred"
//    ซึ่งลูกค้าอ่านไม่รู้เรื่องและร้านก็ไม่รู้ว่าพังตรงไหน
//    ไฟล์นี้ดักไว้ ให้ยังกดกลับหน้าแรกหรือลองใหม่ได้ และบอกสาเหตุให้ร้านเห็น
import Link from "next/link";
import { BRAND } from "@/lib/shop";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // ทิ้งร่องรอยไว้ใน console ให้ไล่ย้อนได้ ถ้าเปิดดูจากเครื่องจริง
    console.error("[gucut] หน้าเว็บพัง:", error);
  }, [error]);

  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <p className="font-heading text-[22px] font-extrabold italic tracking-tight text-safety">{BRAND.name}</p>
      <h1 className="mt-4 text-[16px] font-bold text-ink">หน้านี้มีปัญหาชั่วคราว</h1>
      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-ink-300">
        ขออภัยครับ ลองกดปุ่มด้านล่างดูอีกครั้ง — สินค้าและคำสั่งซื้อของคุณไม่ได้รับผลกระทบ
      </p>
      <div className="mt-5 flex gap-2">
        <button onClick={reset} className="rounded-sm bg-safety px-5 py-2.5 text-[14px] font-semibold text-white">
          ลองใหม่
        </button>
        <Link href="/" className="rounded-sm border border-steel-600 px-5 py-2.5 text-[14px] font-semibold text-ink">
          กลับหน้าแรก
        </Link>
      </div>
      {error?.digest && <p className="mt-6 text-[11px] text-ink-300">รหัสอ้างอิง: {error.digest}</p>}
    </main>
  );
}
