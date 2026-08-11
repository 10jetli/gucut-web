import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import AllReviews from "@/components/AllReviews";
import { getProduct, products } from "@/lib/catalog";
import { REVIEWED_HANDLES } from "@/lib/reviews";
import { formatPrice } from "@/lib/types";

export const dynamicParams = false;

// สร้างเฉพาะสินค้าที่มีรีวิวจริง (ตอนนี้ 34 ตัว)
export function generateStaticParams() {
  const inCatalog = new Set(products.map((p) => p.h));
  return REVIEWED_HANDLES.filter((h) => inCatalog.has(h)).map((handle) => ({ handle }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const p = getProduct(decodeURIComponent(raw));
  if (!p) return {};
  const n = p.rv?.n ?? 0;
  return {
    title: `รีวิว ${p.t} (${n.toLocaleString("th-TH")} รีวิว) | GUCUT`,
    description: `อ่านรีวิวจากผู้ซื้อจริง ${n.toLocaleString("th-TH")} รายการ คะแนนเฉลี่ย ${p.rv?.a ?? "-"} เต็ม 5 — ${p.t}`,
    alternates: { canonical: `/products/${encodeURIComponent(p.h)}/reviews/` },
  };
}

export default async function ReviewsPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const p = getProduct(decodeURIComponent(raw));
  if (!p || !p.rv) notFound();

  const productUrl = `/products/${encodeURIComponent(p.h)}/`;
  const dataUrl = `/rv/${p.id.split("/").pop()}.json`;

  return (
    <main className="pb-10">
      {/* หัวหน้า */}
      <header className="sticky top-0 z-40 flex h-[52px] items-center gap-2 border-b border-steel-700 bg-white px-2">
        <Link href={productUrl} aria-label="ย้อนกลับ" className="px-1 text-xl text-[#333]">
          ‹
        </Link>
        <h1 className="font-heading text-[15px] font-semibold">รีวิวทั้งหมด</h1>
        <span className="ml-auto pr-1 text-xs text-steel-300">
          {p.rv.n.toLocaleString("th-TH")} รีวิว
        </span>
      </header>

      {/* สินค้าที่กำลังดูรีวิว */}
      <Link href={productUrl} className="flex items-center gap-3 border-b border-steel-700 px-3 py-2.5">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-steel-700 bg-white">
          {p.img && <Image src={p.img} alt={p.t} fill sizes="56px" className="object-contain" />}
        </div>
        <div className="min-w-0">
          <p className="clamp-2 text-[13px] leading-tight text-[#333]">{p.t}</p>
          <p className="mt-0.5 text-[13px] font-semibold text-safety">{formatPrice(p.p)}</p>
        </div>
        <span className="ml-auto text-steel-300">›</span>
      </Link>

      <AllReviews src={dataUrl} avg={p.rv.a} count={p.rv.n} />
    </main>
  );
}
