import Link from "next/link";
import { menuGroups } from "@/lib/catalog";

export const metadata = { title: "หมวดหมู่สินค้า | GUCUT" };

// หน้ารวมหมวดหมู่ — โครงเดียวกับเมนูบน gucut.com
export default function CategoriesPage() {
  const { top, groups } = menuGroups();

  return (
    <main className="pb-4">
      <header className="border-b border-steel-800 px-3 py-3">
        <h1 className="font-heading text-lg font-bold">หมวดหมู่สินค้า</h1>
      </header>

      <section className="px-3 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {top.map((c) => (
            <Link
              key={c.h}
              href={`/c/${encodeURIComponent(c.h)}/`}
              className="rounded-lg bg-steel-800 p-3 active:scale-[0.98]"
            >
              <p className="font-heading text-[15px] font-semibold text-[#222]">{c.t}</p>
              <p className="mt-0.5 text-xs text-steel-300">{c.n} รายการ</p>
            </Link>
          ))}
        </div>
      </section>

      {[...groups.entries()].map(([group, items]) => (
        <section key={group} className="px-3 pt-5">
          <h2 className="mb-2 font-heading text-base font-bold text-safety">{group}</h2>
          <div className="grid grid-cols-2 gap-2">
            {items.map((c) => (
              <Link
                key={c.h}
                href={`/c/${encodeURIComponent(c.h)}/`}
                className="rounded-lg bg-steel-800 p-3 active:scale-[0.98]"
              >
                <p className="text-[13px] leading-tight text-[#222]">{c.t}</p>
                <p className="mt-0.5 text-xs text-steel-300">{c.n} รายการ</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
