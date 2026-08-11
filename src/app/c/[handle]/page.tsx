import Link from "next/link";
import { notFound } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { collections, getCollection, inCollection } from "@/lib/catalog";

export const dynamicParams = false;

export function generateStaticParams() {
  return collections.map((c) => ({ handle: c.h }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const c = getCollection(decodeURIComponent(raw));
  return c
    ? {
        title: `${c.t} — GUCUT`,
        description: `${c.t} ของแท้ ${c.n} รายการ ราคาส่ง มีสต็อกพร้อมส่งทั่วไทย | GUCUT`,
        alternates: { canonical: `/c/${encodeURIComponent(c.h)}/` },
      }
    : {};
}

export default async function CollectionPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw);
  const c = getCollection(handle);
  if (!c) notFound();

  const items = inCollection(handle).slice().sort((a, b) => {
    const rank = (x: typeof a) => (x.img && x.st > 0 ? 0 : x.img ? 1 : 2);
    return rank(a) - rank(b) || b.st - a.st;
  });

  return (
    <main className="pb-4">
      <header className="flex items-center gap-2 border-b border-steel-800 px-3 py-3">
        <Link href="/categories/" className="text-xl leading-none text-steel-300" aria-label="ย้อนกลับ">
          &lsaquo;
        </Link>
        <div>
          <h1 className="font-heading text-lg font-bold">{c.t}</h1>
          <p className="text-xs text-steel-300">{items.length.toLocaleString("th-TH")} รายการ</p>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="px-3 py-10 text-center text-sm text-steel-300">ยังไม่มีสินค้าในหมวดนี้</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 px-3">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
