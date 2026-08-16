"use client";

// โครงหน้าเว็บ — หน้าร้านมีเมนูล่าง ส่วนหลังร้าน (/admin) ไม่ต้องมี
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";
import SiteFooter from "@/components/SiteFooter";
import PwaSetup from "@/components/PwaSetup";
import PixelSetup from "@/components/PixelSetup";
import LiveBeacon from "@/components/LiveBeacon";

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "";

  // หลังร้านอยู่ที่ admin.gucut.com ด้วย — เข้าทางหน้าแรกของโดเมนนั้น
  // เส้นทางที่เบราว์เซอร์เห็นจะเป็น "/" ทั้งที่เนื้อหาคือหน้าเข้าระบบหลังร้าน
  // จึงต้องดูชื่อโดเมนประกอบ ไม่งั้นเมนูหน้าร้านจะโผล่มาคร่อมหน้าหลังร้าน
  const [adminHost, setAdminHost] = useState(false);
  useEffect(() => {
    setAdminHost(window.location.hostname.startsWith("admin."));
  }, []);

  // หน้าหลังร้าน + หน้าล็อกอิน/สมัคร = เต็มจอ ไม่ต้องมีเมนูล่าง
  const admin = adminHost || path.startsWith("/admin") || /^\/account\/(login|register|link)/.test(path);
  // หน้าวิดีโอเป็นฟีดเต็มจอเลื่อนทีละคลิป ท้ายเว็บจะไปขวางจังหวะเลื่อน
  // หน้าสั่งซื้อมีแถบสรุปยอดติดล่างจอแล้ว ท้ายเว็บจะไปแย่งที่แบบไม่มีเหตุผล
  const bare = admin || path.startsWith("/videos") || path.startsWith("/checkout");
  return (
    <>
      <PwaSetup />
      {/* พิกเซลการตลาด — หน้าร้านเท่านั้น หลังร้านไม่ต้องถูกตามรอย */}
      {!admin && <PixelSetup />}
      {/* นับผู้เข้าชม — หน้าร้านเท่านั้น ไม่นับตัวเองตอนเข้าหลังร้าน */}
      {!admin && <LiveBeacon />}
      <div className={"mx-auto min-h-screen max-w-lg" + (admin ? "" : " pb-20")}>
        {children}
        {!bare && <SiteFooter />}
      </div>
      {!admin && <BottomNav />}
    </>
  );
}
