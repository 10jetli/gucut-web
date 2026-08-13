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

      {/* ทางไปดูสินค้าทั้งหมด — เดิมมีตาราง "สินค้าแนะนำ" 30 ชิ้นอยู่เหนือปุ่มนี้
          เอาออกแล้วเพราะโหลดรูปทีเดียว 30 ใบ ทำให้หน้าแรกช้า
          ลูกค้าเลือกจากหมวดหรือค้นหาตรง ๆ เร็วกว่าเลื่อนดูของสุ่ม ๆ */}
      <Link
        href="/categories/"
        className="mx-3 mt-7 block rounded-sm border-2 border-safety py-3 text-center text-[15px] font-medium text-safety active:bg-safety active:text-white"
      >
        ดูสินค้าทั้งหมด 2,482 รายการ ›
      </Link>

    </main>
  );
}
