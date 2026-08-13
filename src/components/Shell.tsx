"use client";

// โครงหน้าเว็บ — หน้าร้านมีเมนูล่าง ส่วนหลังร้าน (/admin) ไม่ต้องมี
import { usePathname } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import SiteFooter from "@/components/SiteFooter";
import PwaSetup from "@/components/PwaSetup";

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";
  // หน้าหลังร้าน + หน้าล็อกอิน/สมัคร = เต็มจอ ไม่ต้องมีเมนูล่าง
  const admin = path.startsWith("/admin") || /^\/account\/(login|register|link)/.test(path);
  // หน้าวิดีโอเป็นฟีดเต็มจอเลื่อนทีละคลิป ท้ายเว็บจะไปขวางจังหวะเลื่อน
  const bare = admin || path.startsWith("/videos");
  return (
    <>
      <PwaSetup />
      <div className={"mx-auto min-h-screen max-w-lg" + (admin ? "" : " pb-20")}>
        {children}
        {!bare && <SiteFooter />}
      </div>
      {!admin && <BottomNav />}
    </>
  );
}
