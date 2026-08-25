"use client";

// ปุ่มตะกร้าบนหัวเว็บ พร้อมตัวเลขจำนวนสินค้า
//
// ⚠️ ตัวเลขนี้ย้ายมาจากเมนูล่าง (25 ส.ค. 2569) ตอนที่เอาตะกร้าออกจากเมนูล่าง
//    เพื่อเอา "ขอทะเบียน" ไปแทน — ตะกร้าอยู่มุมขวาบนเหมือนทุกเว็บอยู่แล้ว
//    แต่ตอนนั้นหัวเว็บยังไม่มีตัวเลข ถ้าไม่ย้ายมาด้วยลูกค้าที่ใส่ของไว้จะลืมว่ามีของค้าง
//    ซึ่งเป็นสาเหตุที่คนกดสั่งไม่จบอันดับต้น ๆ ของร้านออนไลน์
//
// ⚠️ ห้ามมีตัวเลขจำนวนสองที่พร้อมกัน — ต้องคอยทำให้ตรงกันแล้วมันจะไม่ตรง

import Link from "next/link";
import { useEffect, useState } from "react";
import { cartCount } from "@/lib/cart";

export default function CartLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const load = () => setCount(cartCount());
    load();
    // ตะกร้าเปลี่ยนจากหน้าไหนก็ได้ ต้องฟังทั้งเหตุการณ์ของเราเองและของแท็บอื่น
    window.addEventListener("cart-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("cart-updated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  return (
    <Link
      href="/cart/"
      aria-label={count > 0 ? `ตะกร้า มีสินค้า ${count} ชิ้น` : "ตะกร้า"}
      className="relative shrink-0 p-1"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-white stroke-[1.8]">
        <path
          d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.6L21 8H6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="20" r="1.2" className="fill-white" />
        <circle cx="18" cy="20" r="1.2" className="fill-white" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-safety px-1 text-[9px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
