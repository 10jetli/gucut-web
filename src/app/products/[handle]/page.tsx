import { notFound } from "next/navigation";
import ProductDetail from "@/components/ProductDetail";
import ReviewSection from "@/components/ReviewSection";
import { products, getProduct, getCollection, inCollection, sellable } from "@/lib/catalog";
import { reviewItems } from "@/lib/reviews";

export const dynamicParams = false;

export function generateStaticParams() {
  return products.map((p) => ({ handle: p.h }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const p = getProduct(decodeURIComponent(raw));
  if (!p) return {};
  return {
    title: `${p.t} | GUCUT`,
    description: p.d.slice(0, 160) || p.t,
    alternates: { canonical: `/products/${encodeURIComponent(p.h)}/` },
    openGraph: {
      title: p.t,
      description: p.d.slice(0, 160) || p.t,
      images: p.img ? [p.img] : [],
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw);
  const p = getProduct(handle);
  if (!p) notFound();

  const crumbs = p.cols
    .map((h) => getCollection(h))
    .filter(Boolean)
    .map((c) => ({ h: c!.h, t: c!.t }));

  // สินค้าใกล้เคียง = หมวดเดียวกัน มีรูป มีสต็อก
  const first = p.cols[0];
  const related = first
    ? inCollection(first)
        .filter((r) => r.h !== p.h && sellable(r))
        .slice(0, 12)
    : [];

  // Product schema — ทำให้ Google โชว์ราคาและสถานะสินค้าใต้ลิงก์ในผลค้นหา
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.t,
    description: p.d.slice(0, 300) || p.t,
    image: p.imgs.slice(0, 5),
    sku: p.sku || undefined,
    brand: { "@type": "Brand", name: /KINGKONG|KING KONG/i.test(p.t) ? "KINGKONG" : /NEWWAVE/i.test(p.t) ? "NEWWAVE" : "GUCUT" },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "THB",
      lowPrice: p.p,
      highPrice: p.pmax,
      offerCount: Math.max(1, p.v.length),
      availability: p.st > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "GUCUT" },
    },
    // ดาวใต้ลิงก์ในผลค้นหา Google — ใช้คะแนนจริงจาก Shopee/Lazada/TikTok
    ...(p.rv
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: p.rv.a,
            reviewCount: p.rv.n,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductDetail
        product={p}
        related={related}
        crumbs={crumbs}
        reviews={
          p.rv ? (
            <ReviewSection
              summary={p.rv}
              items={reviewItems(p.h).slice(0, 3)}
              withPhoto={reviewItems(p.h).filter((r) => r.images.length > 0 || r.video).length}
              href={`/products/${encodeURIComponent(p.h)}/reviews/`}
            />
          ) : null
        }
      />
    </>
  );
}
