import Link from "next/link";
import type { Collection } from "@/lib/types";

// แถบหมวดหมู่เลื่อนแนวนอน สไตล์ TikTok Shop — อยู่ใต้ช่องค้นหา
export default function CategoryNav({ items }: { items: Collection[] }) {
  return (
    <nav className="no-scrollbar flex gap-2 overflow-x-auto border-b border-steel-700 bg-white px-3 py-2">
      <Link
        href="/"
        className="shrink-0 rounded-full bg-safety px-3 py-1.5 text-[13px] font-medium text-white"
      >
        หน้าแรก
      </Link>
      {items.map((c) => (
        <Link
          key={c.h}
          href={`/c/${encodeURIComponent(c.h)}/`}
          className="shrink-0 rounded-full border border-steel-700 bg-[#f7f7f7] px-3 py-1.5 text-[13px] text-[#1a1a1a]"
        >
          {c.t}
        </Link>
      ))}
      <Link
        href="/categories/"
        className="shrink-0 rounded-full border border-steel-700 px-3 py-1.5 text-[13px] text-safety"
      >
        ทั้งหมด ›
      </Link>
    </nav>
  );
}
