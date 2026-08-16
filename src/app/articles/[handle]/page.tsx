import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { articles, getArticle, relatedArticles, thaiDate } from "@/lib/articles";

export const dynamicParams = false;

export function generateStaticParams() {
  return articles.map((a) => ({ handle: a.h }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const a = getArticle(decodeURIComponent((await params).handle));
  if (!a) return {};
  return {
    title: `${a.t} | GUCUT`,
    description: a.d || a.t,
    openGraph: {
      title: a.t,
      description: a.d || a.t,
      type: "article",
      publishedTime: a.at,
      images: a.img ? [a.img] : undefined,
    },
  };
}

export default async function ArticlePage({
  params,
}: { params: Promise<{ handle: string }> }) {
  const a = getArticle(decodeURIComponent((await params).handle));
  if (!a) return null;
  const more = relatedArticles(a);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      {/* บอก Google ว่านี่คือบทความ ใครเขียน เผยแพร่เมื่อไหร่ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: a.t,
            datePublished: a.at,
            image: a.img ? [a.img] : undefined,
            author: { "@type": "Organization", name: "GUCUT" },
            publisher: { "@type": "Organization", name: "GUCUT" },
          }),
        }}
      />

      <header className="flex items-center gap-1 bg-safety px-2 py-3 text-white">
        <Link href="/articles/" aria-label="บทความทั้งหมด" className="p-1 text-[22px] leading-none">‹</Link>
        <span className="text-[15px] font-medium">บทความ</span>
      </header>

      <article className="mx-2 mt-2 overflow-hidden rounded-xl bg-white">
        {a.img && (
          <span className="relative block aspect-[4/3] w-full bg-steel-900">
            <Image src={a.img} alt={a.t} fill sizes="(max-width: 512px) 100vw, 512px" className="object-cover" priority />
          </span>
        )}
        <div className="p-4">
          <h1 className="text-[19px] font-bold leading-snug text-ink">{a.t}</h1>
          <p className="mt-1.5 text-[12px] text-ink-300">{thaiDate(a.at)}</p>
          <div className="article-body mt-4" dangerouslySetInnerHTML={{ __html: a.body }} />
        </div>
      </article>

      {/* ชวนไปดูสินค้าจริง — บทความมีไว้ให้คนหาเจอแล้วเดินต่อเข้าร้าน */}
      <section className="mx-2 mt-2 rounded-xl bg-white p-4 text-center">
        <p className="text-[14px] font-medium text-ink">ร้าน GUCUT ขายเลื่อยยนต์ NEWWAVE / KingKong ของแท้</p>
        <p className="mt-1 text-[12px] text-ink-300">โซ่ บาร์ อะไหล่ครบทุกรุ่น · ส่งทั่วไทย</p>
        <Link href="/" className="mt-3 inline-block rounded-sm bg-safety px-6 py-2.5 text-[14px] font-semibold text-white">
          ดูสินค้าทั้งหมด
        </Link>
      </section>

      {more.length > 0 && (
        <section className="mx-2 mb-8 mt-2 overflow-hidden rounded-xl bg-white">
          <p className="border-b border-steel-700 px-4 py-3 text-[14px] font-bold text-ink">อ่านต่อ</p>
          {more.map((x) => (
            <Link
              key={x.h}
              href={`/articles/${encodeURIComponent(x.h)}/`}
              className="flex gap-3 border-b border-steel-700 p-3 last:border-0"
            >
              {x.img && (
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded bg-steel-900">
                  <Image src={x.img} alt="" fill sizes="56px" className="object-cover" />
                </span>
              )}
              <span className="clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-ink">{x.t}</span>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
