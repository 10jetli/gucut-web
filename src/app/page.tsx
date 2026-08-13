import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import BannerSlider from "@/components/BannerSlider";
import CategoryNav from "@/components/CategoryNav";
import ProductCard from "@/components/ProductCard";
import SectionHead from "@/components/SectionHead";
import { bestSellers, collections, inCollection, sellable } from "@/lib/catalog";

// หน้าแรก — feed สไตล์ Shopee / TikTok Shop
export default function HomePage() {
  const nav = collections.filter((c) => c.n > 0).slice(0, 12);
  const best = bestSellers(30);

  // แถวสินค้าตามหมวดเด่น
  const rows = ["เลื่อยยนต์", "โซ่นิวเวฟ", "โซ่คิงคอง", "guidebar"]
    .map((h) => {
      const c = collections.find((x) => x.h === h);
      const items = inCollection(h).filter(sellable).slice(0, 10);
      return c && items.length ? { c, items } : null;
    })
    .filter(Boolean) as { c: (typeof collections)[number]; items: ReturnType<typeof bestSellers> }[];

  return (
    <main>
      <SearchBar />
      <CategoryNav items={nav} />
      <BannerSlider />

      {rows.map(({ c, items }) => (
        <section key={c.h} className="mt-5">
          <SectionHead title={c.t} href={`/c/${encodeURIComponent(c.h)}/`} count={c.n} />
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1">
            {items.map((p) => (
              <div key={p.id} className="w-36 shrink-0">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-6">
        <SectionHead title="สินค้าแนะนำ" />
        <div className="grid grid-cols-2 gap-2 px-3">
          {best.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <Link
          href="/categories/"
          className="mx-3 mt-3 block rounded-sm border-2 border-safety py-2.5 text-center text-sm font-medium text-safety active:bg-safety active:text-white"
        >
          ดูสินค้าทั้งหมด 2,482 รายการ ›
        </Link>
      </section>

    </main>
  );
}
