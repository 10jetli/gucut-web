import type { Metadata } from "next";
import Link from "next/link";
import { articles } from "@/lib/articles";
import { collections, inCollection, products, sellable } from "@/lib/catalog";
import { BRAND, titleSuffix } from "@/lib/shop";

// แผนผังเว็บแบบคนอ่าน — /sitemap/
//
// ต่างจาก /sitemap.xml ที่เขียนให้เครื่องอ่านอย่างเดียว
// หน้านี้มีลิงก์จริงให้ทั้งคนและตัวไล่เก็บของ Google เดินตามได้
// ช่วยให้หน้าลึก ๆ (หมวดย่อย บทความเก่า) ถูกเก็บทั่วถึงขึ้น
//
// ⚠️ ไม่ลิสต์สินค้าทั้ง 2,400 รายการในหน้าเดียว
//    หน้าจะหนักมากและ Google มองว่าเป็นหน้ารวมลิงก์ไร้สาระ
//    ลิสต์หมวดให้ครบพอ แล้วปล่อยให้เดินต่อเข้าไปในหมวดเอง
export const metadata: Metadata = {
  title: titleSuffix("แผนผังเว็บไซต์"),
  description: `รวมทุกหมวดสินค้าและบทความของร้าน ${BRAND.name} ในหน้าเดียว`,
  alternates: { canonical: "/sitemap/" },
};

export default function SitemapPage() {
  const cols = collections
    .map((c) => ({ ...c, n: inCollection(c.h).filter(sellable).length }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  const sellCount = products.filter(sellable).length;

  return (
    <main className="min-h-[70vh] px-3 py-4">
      <h1 className="text-[17px] font-bold text-ink">แผนผังเว็บไซต์</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-300">
        รวมทุกหน้าของร้าน {BRAND.name} — สินค้าที่พร้อมขาย{" "}
        {sellCount.toLocaleString("th-TH")} รายการ ใน {cols.length} หมวด
        และบทความ {articles.length} เรื่อง
      </p>

      <Section title="หน้าหลัก">
        {[
          ["/", "หน้าแรก"],
          ["/categories/", "หมวดหมู่ทั้งหมด"],
          ["/search/", "ค้นหาสินค้า"],
          ["/videos/", "คลิปหน้างานจริง"],
          ["/articles/", "บทความ"],
          ["/faq/", "คำถามที่พบบ่อย"],
          ["/cart/", "ตะกร้าสินค้า"],
          ["/account/", "บัญชีของฉัน"],
          ["/policy/privacy/", "นโยบายความเป็นส่วนตัว"],
          ["/policy/terms/", "เงื่อนไขการใช้บริการ"],
        ].map(([href, t]) => (
          <Item key={href} href={href} title={t} />
        ))}
      </Section>

      <Section title={`หมวดสินค้า (${cols.length})`}>
        {cols.map((c) => (
          <Item key={c.h} href={`/c/${encodeURIComponent(c.h)}/`} title={c.t} note={`${c.n.toLocaleString("th-TH")} รายการ`} />
        ))}
      </Section>

      <Section title={`บทความ (${articles.length})`}>
        {articles.map((a) => (
          <Item key={a.h} href={`/articles/${encodeURIComponent(a.h)}/`} title={a.t} />
        ))}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[14px] font-bold text-ink">{title}</h2>
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
    </section>
  );
}

function Item({ href, title, note }: { href: string; title: string; note?: string }) {
  return (
    <li className="text-[13px] leading-relaxed">
      <Link href={href} className="text-safety underline underline-offset-2">{title}</Link>
      {note && <span className="ml-1.5 text-[11.5px] text-ink-300">{note}</span>}
    </li>
  );
}
