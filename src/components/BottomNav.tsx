"use client";

import Link from "next/link";
import { SHELL_W } from "@/lib/layout";
import { usePathname } from "next/navigation";

// เมนูล่าง 5 ปุ่มแบบแอพ Shopee
//
// ⚠️ ตะกร้าย้ายขึ้นไปอยู่บนหัวเว็บแล้ว (25 ส.ค. 2569) พร้อมตัวเลขจำนวนสินค้า
//    ห้ามเอาตะกร้ากลับมาใส่ตรงนี้โดยไม่ถอดออกจากหัวเว็บก่อน
//    มีสองที่พร้อมกัน = ตัวเลขจำนวนสองจุดที่ต้องคอยให้ตรงกัน แล้วมันจะไม่ตรง
//
// ⚠️ "ขอทะเบียน" มาแทนเพราะเป็นสิ่งที่คนหาแล้วไม่รู้จะไปหาที่ไหน
//    ส่วนตะกร้าคนรู้อยู่แล้วว่าอยู่มุมขวาบนเหมือนทุกเว็บ
const items = [
  { href: "/", label: "หน้าแรก", icon: HomeIcon },
  { href: "/categories", label: "หมวดหมู่", icon: GridIcon },
  { href: "/videos", label: "วิดีโอ", icon: PlayIcon },
  { href: "/permit", label: "ขอทะเบียน", icon: DocIcon },
  { href: "/account", label: "บัญชี", icon: UserIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  // หน้าสินค้าใช้แถบ "ใส่ตะกร้า / ซื้อเลย" แทน เมนูล่างจึงต้องหลบ
  // (เช็คหลังเรียก hooks ครบแล้ว ไม่งั้นผิดกฎ React)
  if (pathname?.startsWith("/products/")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-steel-700 bg-white pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className={`mx-auto flex ${SHELL_W}`}>
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
              <Icon />
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
// เอกสารมีเส้นข้อความ — สื่อว่า "กรอกฟอร์ม" ไม่ใช่ "อ่านบทความ"
function DocIcon() {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h4" />
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
