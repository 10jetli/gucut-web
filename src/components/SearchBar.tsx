import Link from "next/link";
import { BRAND } from "@/lib/shop";
import HeaderChat from "./HeaderChat";
import ScanButton from "./ScanButton";

// หัวเว็บ — แถบเข้มเต็มความกว้าง โลโก้ + ช่องค้นหาขาว + ไอคอนตะกร้า
// เส้นส้มใต้แถบคือลายเซ็นของแบรนด์ ใช้ซ้ำที่ท้ายเว็บและหัวข้อทุกหมวด
export default function SearchBar() {
  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-safety bg-carbon px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="flex items-center gap-2">
        {/* โลโก้ตามอาร์ตเวิร์กจริง: GU ส้ม + CUT เทา บนแถบดำ */}
        <Link
          href="/"
          aria-label={`${BRAND.name} หน้าแรก`}
          className="shrink-0 font-heading text-[19px] font-extrabold italic leading-none tracking-tight"
        >
          <span className="text-safety">GU</span>
          <span className="text-[#c9cacc]">CUT</span>
        </Link>
        {/* ช่องค้นหาขาว = ลิงก์ไปหน้าพิมพ์ + ปุ่มกล้องอยู่ในกรอบเดียวกัน
            ปุ่มกล้องต้องเป็นพี่น้องกับลิงก์ ไม่ใช่ลูก — ห้ามซ้อน <button> ใน <a>
            min-w-0 สำคัญ — ไม่ใส่แล้วช่องค้นหาไม่ยอมหด ดันไอคอนตะกร้าตกขอบจอ */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm bg-white px-2.5 py-1.5">
          <Link href="/search/" className="flex min-w-0 flex-1 items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-[#6b6b6b] stroke-2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <span className="w-full truncate text-[13px] text-[#6f6f6f]">
              ค้นหาเลื่อยยนต์ โซ่ อะไหล่ รหัสสินค้า...
            </span>
          </Link>
          <ScanButton />
        </div>
        <HeaderChat />
        <Link href="/cart/" aria-label="ตะกร้า" className="shrink-0 p-1">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-white stroke-[1.8]">
            <path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.6L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="20" r="1.2" className="fill-white" />
            <circle cx="18" cy="20" r="1.2" className="fill-white" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
