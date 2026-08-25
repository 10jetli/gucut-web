"use client";

import Image from "next/image";
import { SHELL_W } from "@/lib/layout";
import Link from "next/link";
import SectionHead from "@/components/SectionHead";
import { useEffect, useState, type ReactNode } from "react";
import VariantSheet from "./VariantSheet";
import ChatSheet from "./ChatSheet";
import Stars from "./Stars";
import { teethOf, useLiveStock } from "@/lib/useLiveStock";
import { discountPercent, formatPrice, type Product } from "@/lib/types";
import Price from "@/components/Price";
import ProductVideoFloat from "./ProductVideoFloat";
import { PERMIT_MODELS } from "@/lib/permit";
import ProductTopBar from "./ProductTopBar";
import { videoForProduct } from "@/lib/videos";
import { track } from "@/lib/track";

// หน้าสินค้าแบบ Shopee / TikTok Shop
// สไลด์รูป → ราคา+ป้ายลด → ตัวเลือก → สเปก → คำอธิบาย → แถบซื้อติดล่างจอ
export default function ProductDetail({
  product: p,
  specs,
  related,
  crumbs,
  reviews,
}: {
  product: Product;
  related: Product[];
  crumbs: { h: string; t: string }[];
  reviews?: ReactNode;   // บล็อกรีวิว render มาจากฝั่ง server
  specs?: ReactNode;     // คุณลักษณะ + เอกสาร + ตารางสเปก (server เช่นกัน)
}) {
  // บอกช่องทางโฆษณาว่าลูกค้าเปิดดูสินค้าตัวไหน — ใช้ทำกลุ่มเป้าหมายและรีมาร์เก็ตติ้ง
  useEffect(() => {
    track("ViewContent", { items: [{ id: p.h, title: p.t, price: p.v[0]?.p }], value: p.v[0]?.p ?? 0 });
  }, [p.h, p.t, p.v]);

  const [i, setI] = useState(0);
  const [sheet, setSheet] = useState<null | "cart" | "buy">(null);
  const [chat, setChat] = useState(false);

  // ⚠️ ดูจากรายการ PERMIT_MODELS ไม่ใช่เดาจากคำในชื่อ
  //    ชื่อสินค้าแก้ได้ทุกเมื่อ ถ้าเดาจากคำว่า "มีทะเบียน" แล้ววันหนึ่งมีคนแก้ชื่อ
  //    ปุ่มซื้อจะกลับมาให้จ่ายเงินทันทีโดยไม่มีใครรู้
  const needsPermitProduct = PERMIT_MODELS.some((m) => p.t.includes(m.model));
  const off = discountPercent(p);
  const clip = videoForProduct(p.h);   // มีเฉพาะสินค้าที่ผูกคลิปไว้จริง
  const imgs = p.imgs.length ? p.imgs : [];

  // สินค้าตัวเลือกเดียว: เช็คสต็อก/ราคาสดจาก ZORT ทันทีที่เปิดหน้า
  // (สินค้าหลายตัวเลือกไปเช็คสดตอนเปิด sheet เลือกของแทน — ตรงตัวที่เลือกกว่า)
  const live = useLiveStock(p.v.length <= 1 ? (p.sku || p.v[0]?.k || null) : null, {
    refPrice: p.p,
    perUnit: teethOf(p.v[0]?.t),
  });
  const shownStock = live?.st ?? p.st;

  return (
    <main className="pb-24">
      {/* ปุ่มลอยบนรูป แบบ Shopee — ย้อนกลับ | แชร์ · ตะกร้า · เมนู ⋮ */}
      <ProductTopBar onHelp={() => setChat(true)} shareTitle={p.t} />

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
          <Price
            value={live && p.pmax <= p.p ? live.p : p.p}
            className="font-heading text-2xl font-bold text-safety"
          />
          {p.c && p.c > p.p && (
            <>
              <span className="text-sm text-steel-300 line-through">{formatPrice(p.c)}</span>
              <span className="rounded bg-safety px-1.5 py-0.5 text-[11px] font-bold text-white">
                -{off}%
              </span>
            </>
          )}
        </div>
        <h1 className="mt-2 text-[15px] leading-snug text-[#1a1a1a]">{p.t}</h1>
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
          <span className="text-safety">ส่งทั่วไทย · Flash Express</span>
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
            <span className="ml-2 text-[#1a1a1a]">มี {p.v.length} แบบให้เลือก</span>
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
                className="rounded-full border border-steel-600 px-2.5 py-1 text-xs text-[#1a1a1a]"
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
          <SectionHead title="รายละเอียดสินค้า" bare />
          <div className="space-y-1 text-[13px] leading-relaxed text-[#4a4a4a]">
            {p.d.split("•").map((line, n) =>
              line.trim() ? <p key={n}>• {line.trim()}</p> : null
            )}
          </div>
        </section>
      )}

      {specs}

      {/* สินค้าใกล้เคียง */}
      {related.length > 0 && (
        <section className="mt-3 px-3">
          <SectionHead title="สินค้าที่เกี่ยวข้อง" bare />
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
                  <p className="clamp-2 text-[11px] leading-tight text-[#1a1a1a]">{r.t}</p>
                  <p className="mt-0.5 text-xs font-semibold text-safety">{formatPrice(r.p)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* คลิปลอยมุมจอแบบ Shopee — ลอยเหนือแถบซื้อ ปิดทิ้งได้ */}
      {clip && <ProductVideoFloat video={clip} />}

      {/*
        ⚠️ รุ่นที่ต้องขอทะเบียน "ห้ามให้กดซื้อจ่ายเงินทันที"
           ลำดับจริงของร้าน (เจ้าของร้านยืนยัน 25 ส.ค. 2569):
             ขอทะเบียนก่อน → ได้ใบ ลซ.2 → ส่งให้ร้านพร้อมจ่ายเงิน → ร้านถึงส่งเครื่อง
           ถ้าปล่อยให้จ่ายก่อน ลูกค้าจ่ายหมื่นเจ็ดแล้วเพิ่งรู้ว่าต้องรอเป็นสัปดาห์
           และถ้าขอไม่ผ่านก็ต้องมานั่งคืนเงินกันทีหลัง
        ⚠️ ดูจากป้าย "(มีทะเบียน)" ในชื่อสินค้า — ตรงกับรายการ PERMIT_MODELS ทุกตัว
           ตรวจแล้วเมื่อ 25 ส.ค. 2569 ไม่ผิดสักรุ่น
      */}
      {needsPermitProduct && (
        <div className="mx-2 mb-2 rounded-sm bg-[#fffbe6] p-3">
          <p className="text-[13.5px] font-bold text-ink">รุ่นนี้ต้องขอทะเบียนก่อน</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-700">
            เลื่อยโซ่ยนต์รุ่นนี้เป็นสินค้าควบคุมตามกฎหมาย —
            ต้องได้ใบอนุญาตก่อน ทางร้านถึงจะส่งเครื่องให้ได้
            <span className="mt-1 block text-ink-300">
              ขั้นตอน: ขอทะเบียน → ได้ใบ ลซ.๒ → ส่งให้ร้านพร้อมชำระเงิน → ร้านส่งเครื่อง
            </span>
          </p>
          <Link
            href="/permit/"
            className="mt-2 block w-full rounded-sm bg-ink py-2.5 text-center text-[14px] font-bold text-white"
          >
            เริ่มขอทะเบียน — กรอกให้ฟรี
          </Link>
        </div>
      )}

      {/* แถบซื้อติดล่างจอ — แชท | ตะกร้า | ซื้อเลย+ราคา */}
      <div className={`fixed inset-x-0 bottom-0 z-[60] mx-auto flex ${SHELL_W} items-stretch border-t border-steel-700 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(0,0,0,0.06)]`}>
        <button
          onClick={() => setChat(true)}
          className="flex w-[68px] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-steel-700 py-1.5 text-safety"
        >
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-current stroke-[1.7]">
            <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9.5 9.5 0 01-3.3-.6L3 21l1.8-4.4A8.3 8.3 0 013 11.5 8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" strokeLinejoin="round" />
          </svg>
          <span className="text-[10px] leading-none">แชทเลย</span>
        </button>
        <button
          onClick={() => setSheet("cart")}
          disabled={shownStock <= 0}
          className="flex w-[80px] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-steel-700 py-1.5 text-safety disabled:text-steel-600"
        >
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-current stroke-[1.7]">
            <path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.6L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="20" r="1.2" className="fill-current" />
            <circle cx="18" cy="20" r="1.2" className="fill-current" />
            <path d="M14 6.5h4M16 4.5v4" strokeLinecap="round" />
          </svg>
          <span className="text-[10px] leading-none">ใส่ตะกร้า</span>
        </button>
        <button
          onClick={() => setSheet("buy")}
          disabled={shownStock <= 0}
          className="flex flex-1 flex-col items-center justify-center bg-safety py-2 font-heading leading-tight text-white disabled:bg-steel-700 disabled:text-steel-300"
        >
          {shownStock <= 0 ? (
            <span className="text-sm font-semibold">สินค้าหมด</span>
          ) : (
            <>
              <span className="text-[11px] font-medium opacity-90">
                {needsPermitProduct ? "จองไว้ก่อน" : "ซื้อเลย"}
              </span>
              <Price value={live && p.pmax <= p.p ? live.p : p.p} className="text-[17px] font-bold" />
            </>
          )}
        </button>
      </div>

      <ChatSheet
        open={chat}
        onClose={() => setChat(false)}
        product={{ h: p.h, t: p.t, img: imgs[0] ?? p.img, p: live?.p ?? p.p }}
      />

      <VariantSheet
        product={p}
        open={sheet !== null}
        mode={sheet ?? "cart"}
        onClose={() => setSheet(null)}
      />
    </main>
  );
}
