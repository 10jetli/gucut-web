import Link from "next/link";
import { SITE_HOST } from "@/lib/site";

// ท้ายเว็บ — บล็อกเข้มปิดท้ายทุกหน้าร้าน ใช้เส้นส้มเดียวกับหัวเว็บ
// อยู่ใน Shell จึงขึ้นเองทุกหน้า ไม่ต้องไปใส่ทีละหน้า
export default function SiteFooter() {
  return (
    <footer className="mt-8 border-t-[3px] border-safety bg-carbon px-5 py-7 text-center">
      <p className="font-heading text-[26px] font-extrabold italic leading-none tracking-tight">
        <span className="text-safety-light">GU</span><span className="text-white">CUT</span>
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
        {/* ⚠️ ไม่ใส่ลิงก์ "ใบอนุญาตประกอบกิจการ" ไว้ตรงนี้ตามที่เจ้าของร้านสั่ง (24 ส.ค. 2569)
            พูดเรื่องใบอนุญาตให้ลูกค้าเห็นเด่น ๆ จะทำให้เขานึกขึ้นได้ว่าตัวเองต้องมีใบ ลซ.3 ด้วย
            แล้วลังเลที่จะซื้อ — ทั้งที่เป็นหน้าที่ของผู้ซื้อตามกฎหมายอยู่แล้ว

            หน้า /policy/license/ ยังอยู่ครบและเปิดดูได้ทุกคน · อยู่ใน sitemap ·
            อยู่ใน llms.txt / llms-full.txt / agents.md · และใบอนุญาตถูกส่งเป็น JSON-LD ทุกหน้า
            แค่ไม่ลิงก์จากท้ายเว็บเท่านั้น — ไม่ใช่การซ่อนจากใคร */}
      </nav>
      <p className="mt-3 text-[11px] text-[#a9a9a9]">{SITE_HOST}</p>
    </footer>
  );
}
