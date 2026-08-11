import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import BannerSlider from "@/components/BannerSlider";
import FlashSale from "@/components/FlashSale";
import CategoryNav from "@/components/CategoryNav";
import ProductCard from "@/components/ProductCard";
import { bestSellers, collections, flashSale, inCollection, sellable } from "@/lib/catalog";

// หน้าแรก — feed สไตล์ Shopee / TikTok Shop
export default function HomePage() {
  const nav = collections.filter((c) => c.n > 0).slice(0, 12);
  const flash = flashSale(10);
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
      <FlashSale items={flash} />

      {rows.map(({ c, items }) => (
        <section key={c.h} className="mt-4 px-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-heading text-base font-bold">{c.t}</h2>
            <Link href={`/c/${encodeURIComponent(c.h)}/`} className="text-xs text-safety">
              ดูทั้งหมด ({c.n}) ›
            </Link>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {items.map((p) => (
              <div key={p.id} className="w-36 shrink-0">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-5 px-3">
        <h2 className="font-heading text-lg font-bold">
          สินค้าแนะนำ <span className="text-safety">&#128293;</span>
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {best.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <Link
          href="/categories/"
          className="mt-3 block rounded-lg border border-steel-700 py-2.5 text-center text-sm text-[#333]"
        >
          ดูสินค้าทั้งหมด 2,482 รายการ ›
        </Link>
      </section>

      <footer className="mt-8 px-3 pb-4 text-center text-xs text-steel-600">
        GUCUT — เลื่อยยนต์ NEWWAVE / KingKong ของแท้ &middot; new78.com
      </footer>
    </main>
  );
}
