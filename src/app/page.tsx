import Link from "next/link";
import SearchBar from "@/components/SearchBar";
import BannerSlider from "@/components/BannerSlider";
import { HERO_SIZES, heroHalf, heroSrcSet } from "@/lib/hero";
import CategoryNav from "@/components/CategoryNav";
import CouponStrip from "@/components/CouponStrip";
import ProductCard from "@/components/ProductCard";
import HomeVideoFloat from "@/components/HomeVideoFloat";
import SectionHead from "@/components/SectionHead";
import { bestSellers, collections, inCollection, products, sellable } from "@/lib/catalog";
import { ldScript, organizationLd, websiteLd } from "@/lib/seo";
import { floatClips } from "@/lib/feed";

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
      {/* สั่งโหลดรูปแบนเนอร์ตั้งแต่บรรทัดแรกของหน้า
          ปกติเบราว์เซอร์จะเจอรูปนี้ตอนอ่าน HTML มาถึงกลางหน้า ซึ่งช้ากว่าโหลด CSS/JS
          รูปนี้เป็นชิ้นใหญ่สุดที่ลูกค้าเห็น (LCP) จึงคุ้มที่จะแซงคิวให้
          ⚠️ ต้องใช้ srcset/sizes ชุดเดียวกับ <img> เป๊ะ ๆ ไม่งั้นจะโหลดซ้ำสองไฟล์ */}
      <link
        rel="preload"
        as="image"
        href={heroHalf(1080, "top")}
        imageSrcSet={heroSrcSet("top")}
        imageSizes={HERO_SIZES}
        fetchPriority="high"
      />
      <SearchBar />
      <CategoryNav items={nav} />
      {/* บอกเครื่องให้รู้ว่าร้านนี้คือใคร ขายอะไร — ตัวนี้สำคัญที่สุดสำหรับ
          AI (ChatGPT/Gemini/Perplexity) เวลามีคนถามว่า "ซื้อเลื่อยยนต์ที่ไหนดี" */}
      <script type="application/ld+json" dangerouslySetInnerHTML={ldScript(organizationLd())} />
      <script type="application/ld+json" dangerouslySetInnerHTML={ldScript(websiteLd())} />

      <BannerSlider />

      {/* โค้ดส่วนลดให้กดเก็บแบบ Shopee — ร้านยังไม่เปิดโค้ดไหนก็ไม่ขึ้นอะไรเลย ไม่กินที่ */}
      <CouponStrip />

      {rows.map(({ c, items }, rowIdx) => (
        <section key={c.h} className="mt-5">
          <SectionHead title={c.t} href={`/c/${encodeURIComponent(c.h)}/`} count={c.n} />
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1">
            {items.map((p, i) => (
              <div key={p.id} className="w-36 shrink-0 sm:w-40 lg:w-44">
                {/* ความกว้างต้องตรงกับ w-36 / sm:w-40 / lg:w-44 ข้างบน (144 / 160 / 176 px) */}
                <ProductCard
                  product={p}
                  sizes="(max-width: 640px) 144px, (max-width: 1024px) 160px, 176px"
                  // แถวแรก 3 ใบแรกคือของที่ลูกค้าเห็นทันทีตอนเปิดหน้า ให้โหลดก่อนเพื่อน
                  // ที่เหลือเป็น lazy — ถ้าให้ทุกใบโหลดก่อนจะแย่งเน็ตกันจนช้ากว่าเดิม
                  priority={rowIdx === 0 && i < 3}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* ทางไปดูสินค้าทั้งหมด — เดิมมีตาราง "สินค้าแนะนำ" 30 ชิ้นอยู่เหนือปุ่มนี้
          เอาออกแล้วเพราะโหลดรูปทีเดียว 30 ใบ ทำให้หน้าแรกช้า
          ลูกค้าเลือกจากหมวดหรือค้นหาตรง ๆ เร็วกว่าเลื่อนดูของสุ่ม ๆ
          ⚠️ จำนวนรายการนับจาก products ตอน build ห้ามเขียนเลขตายตัว
             (เคยเขียนไว้ 2,482 แล้วของจริงเพิ่มขึ้น กลายเป็นตัวเลขเท็จบนหน้าแรก) */}
      <Link
        href="/categories/"
        className="mx-3 mt-7 block rounded-sm border-2 border-safety py-3 text-center text-[15px] font-medium text-safety active:bg-safety active:text-white"
      >
        ดูสินค้าทั้งหมด {products.length.toLocaleString("th-TH")} รายการ ›
      </Link>

      {/* คลิปลอยมุมขวาล่างแบบ Shopee — สุ่มคลิปใหม่ทุกครั้งที่เปิดหน้า
          ตัวเลือกส่งไปจากตรงนี้ แต่คนที่สุ่มคือเบราว์เซอร์ของลูกค้า (ดู HomeVideoFloat) */}
      <HomeVideoFloat clips={floatClips()} />

    </main>
  );
}
