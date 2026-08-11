"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import VariantSheet from "./VariantSheet";
import Stars from "./Stars";
import { useLiveStock } from "@/lib/useLiveStock";
import { discountPercent, formatPrice, priceLabel, type Product } from "@/lib/types";

// หน้าสินค้าแบบ Shopee / TikTok Shop
// สไลด์รูป → ราคา+ป้ายลด → ตัวเลือก → สเปก → คำอธิบาย → แถบซื้อติดล่างจอ
export default function ProductDetail({
  product: p,
  related,
  crumbs,
  reviews,
}: {
  product: Product;
  related: Product[];
  crumbs: { h: string; t: string }[];
  reviews?: ReactNode;   // บล็อกรีวิว render มาจากฝั่ง server
}) {
  const [i, setI] = useState(0);
  const [sheet, setSheet] = useState<null | "cart" | "buy">(null);
  const off = discountPercent(p);
  const imgs = p.imgs.length ? p.imgs : [];

  // สินค้าตัวเลือกเดียว: เช็คสต็อก/ราคาสดจาก ZORT ทันทีที่เปิดหน้า
  // (สินค้าหลายตัวเลือกไปเช็คสดตอนเปิด sheet เลือกของแทน — ตรงตัวที่เลือกกว่า)
  const live = useLiveStock(p.v.length <= 1 ? (p.sku || p.v[0]?.k || null) : null);
  const shownStock = live?.st ?? p.st;

  return (
    <main className="pb-24">
      {/* สไลด์รูป */}
      <div className="relative aspect-square w-full bg-white">
        {imgs.length ? (
          <Image
            src={imgs[i]}
            alt={p.t}
            fill
            sizes="(max-width: 512px) 100vw, 512px"
            className="object-contain"
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center text-steel-600">ไม่มีรูปสินค้า</div>
        )}
        {imgs.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {i + 1}/{imgs.length}
          </span>
        )}
      </div>

      {imgs.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-2">
          {imgs.map((src, n) => (
            <button
              key={src}
              onClick={() => setI(n)}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded border bg-white ${
                n === i ? "border-safety" : "border-steel-700"
              }`}
            >
              <Image src={src} alt="" fill sizes="56px" className="object-contain" />
            </button>
          ))}
        </div>
      )}

      {/* ราคา */}
      <section className="bg-steel-800 px-3 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-2xl font-bold text-safety">
            {live && p.pmax <= p.p ? formatPrice(live.p) : priceLabel(p)}
          </span>
          {p.c && p.c > p.p && (
            <>
              <span className="text-sm text-steel-300 line-through">{formatPrice(p.c)}</span>
              <span className="rounded bg-safety px-1.5 py-0.5 text-[11px] font-bold text-white">
                -{off}%
              </span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-[15px] leading-snug text-[#222]">{p.t}</h1>
        {p.rv && (
          <a href="#reviews" className="mt-2 flex items-center gap-1.5 text-xs">
            <Stars value={p.rv.a} size={13} />
            <span className="font-semibold text-safety">{p.rv.a.toFixed(1)}</span>
            <span className="text-steel-300">
              ({p.rv.n.toLocaleString("th-TH")} รีวิว)
            </span>
            <span className="text-steel-300">›</span>
          </a>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel-300">
          <span>
            คงเหลือ {shownStock.toLocaleString("th-TH")} ชิ้น
            {live && <span className="ml-1 text-[10px] text-[#1f9254]">● เช็คคลังแล้ว</span>}
          </span>
          {p.sku && <span>SKU {p.sku}</span>}
          <span className="text-safety">ส่งฟรีทั่วไทย</span>
        </div>
      </section>

      {/* ปุ่มเลือกตัวเลือก */}
      {p.v.length > 1 && (
        <button
          onClick={() => setSheet("cart")}
          className="mt-2 flex w-full items-center justify-between bg-steel-800 px-3 py-3 text-left"
        >
          <span className="text-sm text-steel-300">
            {p.opt ?? "ตัวเลือก"}
            <span className="ml-2 text-[#222]">มี {p.v.length} แบบให้เลือก</span>
          </span>
          <span className="text-steel-300">›</span>
        </button>
      )}

      {/* หมวดหมู่ */}
      {crumbs.length > 0 && (
        <section className="mt-2 bg-steel-800 px-3 py-3">
          <p className="mb-2 text-xs text-steel-300">อยู่ในหมวด</p>
          <div className="flex flex-wrap gap-2">
            {crumbs.map((c) => (
              <Link
                key={c.h}
                href={`/c/${encodeURIComponent(c.h)}/`}
                className="rounded-full border border-steel-600 px-2.5 py-1 text-xs text-[#333]"
              >
                {c.t}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* รีวิวจริงจาก Shopee / Lazada / TikTok */}
      {reviews}

      {/* คำอธิบาย */}
      {p.d && (
        <section className="mt-2 bg-steel-800 px-3 py-3">
          <h2 className="mb-2 font-heading text-base font-semibold">รายละเอียดสินค้า</h2>
          <div className="space-y-1 text-[13px] leading-relaxed text-[#555]">
            {p.d.split("•").map((line, n) =>
              line.trim() ? <p key={n}>• {line.trim()}</p> : null
            )}
          </div>
        </section>
      )}

      {/* สินค้าใกล้เคียง */}
      {related.length > 0 && (
        <section className="mt-3 px-3">
          <h2 className="mb-2 font-heading text-base font-semibold">สินค้าที่เกี่ยวข้อง</h2>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/products/${encodeURIComponent(r.h)}`}
                className="w-28 shrink-0 overflow-hidden rounded-lg bg-steel-800"
              >
                <div className="relative aspect-square bg-white">
                  {r.img && <Image src={r.img} alt={r.t} fill sizes="112px" className="object-contain" />}
                </div>
                <div className="p-1.5">
                  <p className="clamp-2 text-[11px] leading-tight text-[#333]">{r.t}</p>
                  <p className="mt-0.5 text-xs font-semibold text-safety">{formatPrice(r.p)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* แถบซื้อติดล่างจอ */}
      <div className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex max-w-lg gap-2 border-t border-steel-700 bg-white p-2 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        <button
          onClick={() => setSheet("cart")}
          disabled={shownStock <= 0}
          className="flex-1 rounded-lg border border-safety py-3 font-heading text-sm font-semibold text-safety disabled:border-steel-600 disabled:text-steel-600"
        >
          ใส่ตะกร้า
        </button>
        <button
          onClick={() => setSheet("buy")}
          disabled={shownStock <= 0}
          className="flex-1 rounded-lg bg-safety py-3 font-heading text-sm font-semibold text-white disabled:bg-steel-700 disabled:text-steel-300"
        >
          {shownStock <= 0 ? "สินค้าหมด" : "ซื้อเลย"}
        </button>
      </div>

      <VariantSheet
        product={p}
        open={sheet !== null}
        mode={sheet ?? "cart"}
        onClose={() => setSheet(null)}
      />
    </main>
  );
}
