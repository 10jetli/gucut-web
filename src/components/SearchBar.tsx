import Link from "next/link";

// หัวเว็บแบบ Shopee — แถบส้มเต็มความกว้าง โลโก้ + ช่องค้นหาขาว + ไอคอนตะกร้า
export default function SearchBar() {
  return (
    <header className="sticky top-0 z-40 bg-safety px-3 pb-2 pt-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Link href="/" className="shrink-0 font-heading text-lg font-bold tracking-tight text-white">
          GUCUT
        </Link>
        <div className="flex flex-1 items-center gap-2 rounded-sm bg-white px-2.5 py-1.5">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-[#757575] stroke-2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="ค้นหาเลื่อยยนต์ โซ่ อะไหล่..."
            className="w-full bg-transparent text-[13px] text-[#222] outline-none placeholder:text-[#9a9a9a]"
          />
        </div>
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
