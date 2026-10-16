import { notFound } from "next/navigation";
import { BRAND, titleSuffix } from "@/lib/shop";
import { abs, breadcrumbLd, ldScript, videoLd } from "@/lib/seo";
import { videoForProduct } from "@/lib/videos";
import ProductDetail from "@/components/ProductDetail";
import ReviewSection from "@/components/ReviewSection";
import { products, getProduct, getCollection, inCollection, sellable } from "@/lib/catalog";
import { reviewItems } from "@/lib/reviews";
import ProductSpecs from "@/components/ProductSpecs";
import { detailOf, attrsOf } from "@/lib/details";
import { availabilityของ, สถานะของสินค้า } from "@/lib/stock-state";
import byskuRaw from "@/data/parts-bysku.json";
import partInfoRaw from "@/data/part-info.json";
import fs from "node:fs";
import path from "node:path";
import { PARTS_MODELS, type PartsDoc } from "@/lib/parts";
import { รุ่นที่ลิงก์ได้, ที่อยู่ลิงก์ } from "@/lib/parts-fits.mjs";

/* อ่านคู่มือจาก public/parts/ **ตอน build** แล้วจำไว้ — ไฟล์ชุดเดียวกับที่หน้า /parts/ ใช้
   🔑 จำไว้ที่ระดับโมดูลเพราะหน้านี้ถูกสร้าง 2,505 ครั้ง ⇒ อ่านไฟล์ซ้ำทุกครั้ง = build ช้าขึ้นเปล่า ๆ
   ⚠️ ไฟล์หาย ⇒ คืน null ⇒ ลิงก์ยังขึ้นได้แต่ **ไม่มีตำแหน่งติดไป** (ไม่ใช่ล้ม build)
      แต่ "ชื่อรุ่นมีในตารางแต่ไฟล์หาย" เป็นของที่ด่าน parts-models-ของครบ.test.mjs จับอยู่แล้ว */
const คู่มือที่จำไว้ = new Map<string, PartsDoc | null>();
function คู่มือของรุ่น(slug: string): PartsDoc | null {
  if (!คู่มือที่จำไว้.has(slug)) {
    const f = path.join(process.cwd(), "public", "parts", `${slug}.json`);
    let doc: PartsDoc | null = null;
    try {
      if (fs.existsSync(f)) doc = JSON.parse(fs.readFileSync(f, "utf8")) as PartsDoc;
    } catch {
      doc = null;
    }
    คู่มือที่จำไว้.set(slug, doc);
  }
  return คู่มือที่จำไว้.get(slug) ?? null;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return products.map((p) => ({ handle: p.h }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const p = getProduct(decodeURIComponent(raw));
  if (!p) return {};
  return {
    title: titleSuffix(`${p.t}`),
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
    brand: { "@type": "Brand", name: /KINGKONG|KING KONG/i.test(p.t) ? "KINGKONG" : /NEWWAVE/i.test(p.t) ? "NEWWAVE" : BRAND.name },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "THB",
      lowPrice: p.p,
      highPrice: p.pmax,
      offerCount: Math.max(1, p.v.length),
      availability: availabilityของ(สถานะของสินค้า(p)),   /* ไม่รู้ ⇒ LimitedAvailability ห้ามบอก Google ว่าหมด */
      seller: { "@type": "Organization", name: BRAND.name },
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

  const clip = videoForProduct(p.h);

  // เส้นทางหน้า — ผลค้นหาจะโชว์ หน้าแรก › หมวด › สินค้า แทน URL ยาว ๆ
  const crumbLd = breadcrumbLd([
    { name: "หน้าแรก", url: "/" },
    ...(crumbs[0] ? [{ name: crumbs[0].t, url: `/c/${encodeURIComponent(crumbs[0].h)}/` }] : []),
    { name: p.t, url: `/products/${encodeURIComponent(p.h)}/` },
  ]);

  // คลิปที่ผูกกับสินค้านี้ — บอกเครื่องว่ามีวิดีโอจริงประกอบสินค้า
  const clipLd = clip
    ? videoLd({
        id: clip.v,
        name: `${p.t} — คลิปจากหน้าร้าน ${BRAND.name}`,
        description: p.d.slice(0, 200) || p.t,
        thumb: abs(`/img/${p.img?.split("/").pop() ?? ""}`),
        dur: clip.dur,
        url: abs(`/videos/?v=${clip.v}`),
      })
    : null;

  /* 🔗 ทางเข้าหน้าแผนผังอะไหล่ — ขึ้นเฉพาะชิ้นที่จับคู่กับคู่มือแล้ว
     ดัชนีสร้างตอน build โดย scripts/gen-parts-bysku.mjs (ไม่ยิง API ตอนลูกค้าเปิดหน้า
     เพราะหน้าสินค้าคือหน้าที่คนเข้ามากที่สุด ยิงทุกครั้ง = เผาเครดิต Netlify) */
  const bysku = byskuRaw as Record<string, { รุ่น: string; ชื่อรุ่น: string; รหัส: string }[]>;
  /* ⚠️ SKU อยู่ได้ทั้งระดับสินค้าและระดับตัวเลือก (v[].k) — ดูที่เดียวจะพลาดของที่มีหลายขนาด */
  const skuทั้งหมด = [p.sku, ...p.v.map((x) => x.k)].filter(Boolean) as string[];
  const จากรหัสอะไหล่ = Array.from(
    new Map(
      skuทั้งหมด.flatMap((k) => bysku[String(k).trim()] ?? []).map((x) => [x.รุ่น, x])
    ).values()
  ).map((x) => ({ slug: x.รุ่น, ชื่อ: x.ชื่อรุ่น, กลุ่ม: null, เลข: null }));

  /* 🔗 **ทางที่สอง: อ่านจากชื่อสินค้า** (เพิ่ม 16 ต.ค. 2569 — ท่านประธานวง SKU 04554 มาว่า "ส่วนนี้ยังไม่มี")
     ทางเดิมข้างบนต้องมีคนลงตารางจับคู่รหัสอะไหล่ไว้ก่อน ⇒ ครอบ 686/2,505
     ของที่ท่านวงมา ชื่อบอกรุ่นกับตำแหน่งครบ ("ยางกันกระแทก MINI L7") และอยู่ในคู่มือจริง
     (fmini กลุ่ม L เลข L7 = buffer ใช้ 2 ชิ้น) **แต่ไม่มีในตารางจับคู่** ⇒ ไปผังไม่ได้เลย
     🔑 สองทางนี้ **ตอบคนละคำถาม** จึงรวมแบบเพิ่มอย่างเดียว ไม่แทนกัน:
        รหัสอะไหล่ = "ชิ้นนี้คือรหัสไหนในคู่มือ" · ชื่อสินค้า = "ชื่อบอกว่าใส่รุ่นอะไร ตำแหน่งไหน"
     ⇒ ทางเดิมแม่นกว่า (ถึงระดับชิ้น) จึงวางไว้ก่อนในลำดับ และเป็นตัวที่ชนะตอนรุ่นซ้ำกัน */
  const partInfo = partInfoRaw as Record<string, { fits?: string[]; pos?: string[] }>;
  const จากชื่อสินค้า = รุ่นที่ลิงก์ได้(partInfo[p.h], PARTS_MODELS, คู่มือของรุ่น) as {
    slug: string; ชื่อ: string; กลุ่ม: string | null; เลข: string | null;
  }[];

  const รุ่นที่เจอ = Array.from(
    new Map([...จากรหัสอะไหล่, ...จากชื่อสินค้า].map((x) => [x.slug, x])).values()
  );

  const แผนผังBlock = รุ่นที่เจอ.length ? (
    <section className="mt-2 bg-steel-800 px-3 py-3">
      <p className="text-[13px] font-semibold text-ink">ไม่แน่ใจว่าใช่ชิ้นนี้ไหม?</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-[#6b6b6b]">
        เปิดภาพแยกชิ้นดูว่าอะไหล่ตัวนี้อยู่ตรงไหนของเครื่อง
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {รุ่นที่เจอ.map((m) => (
          <a
            key={m.slug}
            href={ที่อยู่ลิงก์(m)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-safety bg-white px-3 py-1.5 text-[13px] font-medium text-safety"
          >
            ดูแผนผัง {m.ชื่อ}
            {/* ⚠️ โชว์เลขตำแหน่ง **เฉพาะที่ยืนยันแล้วว่ามีในคู่มือเล่มนั้น**
                ป้ายที่บอกตำแหน่งแต่กดไปไม่เจอ แย่กว่าไม่มีป้าย */}
            {m.เลข && (
              <span className="rounded-sm bg-safety px-1.5 py-0.5 text-[11px] font-bold text-white">
                {m.เลข}
              </span>
            )}
          </a>
        ))}
      </div>
    </section>
  ) : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={ldScript(crumbLd)} />
      {clipLd && <script type="application/ld+json" dangerouslySetInnerHTML={ldScript(clipLd)} />}
      <ProductDetail
        แผนผัง={แผนผังBlock}
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
        specs={<ProductSpecs d={detailOf(p.h)} attrs={attrsOf(p)} />}
      />
    </>
  );
}
