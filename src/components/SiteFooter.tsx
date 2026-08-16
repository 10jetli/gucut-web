import Link from "next/link";
import { SITE_HOST } from "@/lib/site";

// ท้ายเว็บ — บล็อกเข้มปิดท้ายทุกหน้าร้าน ใช้เส้นส้มเดียวกับหัวเว็บ
// อยู่ใน Shell จึงขึ้นเองทุกหน้า ไม่ต้องไปใส่ทีละหน้า
export default function SiteFooter() {
  return (
    <footer className="mt-8 border-t-[3px] border-safety bg-carbon px-5 py-7 text-center">
      <p className="font-heading text-[26px] font-extrabold italic leading-none tracking-tight">
        <span className="text-safety">GU</span><span className="text-white">CUT</span>
      </p>
      <p className="mt-2.5 text-[13px] font-medium text-white">
        เลื่อยยนต์ NEWWAVE / KingKong ของแท้
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-[#a9a9a9]">
        โซ่ บาร์ อะไหล่ครบทุกรุ่น · ส่งทั่วไทย
      </p>
      <span aria-hidden className="mx-auto mt-5 block h-px w-10 bg-safety" />
      {/* Meta / Google บังคับให้ลิงก์สองอันนี้เข้าถึงได้จากทุกหน้า ตอนขอเปิดใช้ปุ่มเข้าสู่ระบบ */}
      <nav className="mt-4 flex items-center justify-center gap-2 text-[11px] text-[#a9a9a9]">
        <Link href="/policy/privacy/" className="underline underline-offset-2">นโยบายความเป็นส่วนตัว</Link>
        <span aria-hidden>·</span>
        <Link href="/policy/terms/" className="underline underline-offset-2">เงื่อนไขการใช้บริการ</Link>
      </nav>
      <p className="mt-3 text-[11px] text-[#8a8a8a]">{SITE_HOST}</p>
    </footer>
  );
}
