"use client";

// ตาข่ายกันหน้าขาวของฝั่งหลังร้าน — โชว์สาเหตุจริงเลย เพราะคนอ่านคือเจ้าของร้าน
// (ฝั่งหน้าร้านไม่โชว์ เพราะลูกค้าอ่านไม่รู้เรื่องและไม่ควรเห็นรายละเอียดภายใน)
import Link from "next/link";
import { useEffect } from "react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[gucut/admin] พัง:", error); }, [error]);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">หน้านี้มีปัญหา</span>
      </header>
      <div className="mx-auto max-w-lg p-3">
        <section className="rounded-sm bg-white p-4">
          <p className="text-[14px] font-bold text-ink">เปิดหน้านี้ไม่ได้</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
            เมนูอื่นในหลังร้านยังใช้งานได้ตามปกติ ลองกดลองใหม่ก่อน
            ถ้ายังไม่หายให้ส่งข้อความข้างล่างนี้ให้ผู้ดูแลระบบ
          </p>
          <pre className="mt-3 overflow-auto rounded-sm bg-steel-900 p-2.5 text-[11px] leading-relaxed text-ink-700">
{error?.message || "ไม่มีรายละเอียด"}{error?.digest ? `\n\nรหัสอ้างอิง: ${error.digest}` : ""}
          </pre>
          <div className="mt-3 flex gap-2">
            <button onClick={reset} className="flex-1 rounded-sm bg-safety py-2.5 text-[14px] font-semibold text-white">
              ลองใหม่
            </button>
            <Link href="/admin/" className="flex-1 rounded-sm border border-steel-600 py-2.5 text-center text-[14px] font-semibold text-ink">
              กลับเมนูหลัก
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
