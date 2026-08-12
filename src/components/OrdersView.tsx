"use client";

// ประวัติการสั่งซื้อ — /account/orders/
// ตอนนี้ยังไม่มีระบบเก็บออเดอร์ (รอทำพร้อมกับเรื่องการชำระเงิน)
// จึงยังไม่มีรายการให้ดู แต่หน้ารออยู่แล้ว ต่อได้ทันทีที่เปิดระบบเงิน
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cachedUser, fetchMe, type User } from "@/lib/account";

export default function OrdersView() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(cachedUser());
    fetchMe().then((u) => { setUser(u); setReady(true); });
  }, []);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-1 bg-safety px-2 py-3 text-white">
        <button onClick={() => router.back()} aria-label="ย้อนกลับ" className="p-1 text-[22px] leading-none">‹</button>
        <span className="text-[15px] font-medium">การซื้อของฉัน</span>
      </header>

      <div className="flex flex-col items-center px-8 py-20 text-center">
        <svg viewBox="0 0 24 24" className="mb-4 h-16 w-16 fill-none stroke-steel-600 stroke-[1.2]">
          <path d="M7 4h10l1 16H6L7 4zM9.5 8h5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-[14px] font-medium text-ink-700">ยังไม่มีรายการสั่งซื้อ</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
          {ready && !user
            ? "เข้าสู่ระบบเพื่อดูประวัติการสั่งซื้อของคุณ"
            : "เมื่อสั่งซื้อแล้ว รายการจะมาแสดงที่นี่"}
        </p>

        {ready && !user ? (
          <Link href="/account/login/?next=/account/orders/"
                className="mt-5 rounded-sm bg-safety px-6 py-2.5 text-[14px] font-semibold text-white">
            เข้าสู่ระบบ
          </Link>
        ) : (
          <Link href="/" className="mt-5 rounded-sm bg-safety px-6 py-2.5 text-[14px] font-semibold text-white">
            เลือกซื้อสินค้า
          </Link>
        )}
      </div>
    </main>
  );
}
