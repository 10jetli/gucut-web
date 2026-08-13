"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cartCount } from "@/lib/cart";

// เมนูล่าง 5 ปุ่มแบบแอพ Shopee
const items = [
  { href: "/", label: "หน้าแรก", icon: HomeIcon },
  { href: "/categories", label: "หมวดหมู่", icon: GridIcon },
  { href: "/videos", label: "วิดีโอ", icon: PlayIcon },
  { href: "/cart", label: "ตะกร้า", icon: CartIcon },
  { href: "/account", label: "บัญชี", icon: UserIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  // badge จำนวนสินค้าในตะกร้า — refresh เมื่อตะกร้าเปลี่ยน
  useEffect(() => {
    const load = () => setCount(cartCount());
    load();
    window.addEventListener("cart-updated", load);
    return () => window.removeEventListener("cart-updated", load);
  }, []);

  // หน้าสินค้าใช้แถบ "ใส่ตะกร้า / ซื้อเลย" แทน เมนูล่างจึงต้องหลบ
  // (เช็คหลังเรียก hooks ครบแล้ว ไม่งั้นผิดกฎ React)
  if (pathname?.startsWith("/products/")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-steel-700 bg-white pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-lg">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                active ? "text-safety" : "text-steel-300 hover:text-[#1a1a1a]"
              }`}
            >
              <span className="relative">
                <Icon />
                {href === "/cart" && count > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-safety px-1 text-[9px] font-bold text-white">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ---- ไอคอน SVG ---- */
const cls = "h-6 w-6";
function HomeIcon() {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1v-10.5Z" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
      <path d="m10 9 5 3-5 3V9Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CartIcon() {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.4 12.2a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.76L21 8H6" />
      <circle cx="10" cy="20" r="1.4" fill="currentColor" /><circle cx="17.5" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
