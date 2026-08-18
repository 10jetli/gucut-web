"use client";

import Image from "next/image";
import { SHELL_W } from "@/lib/layout";
import { useEffect, useState } from "react";
import { addToCart, setBuyNow } from "@/lib/cart";
import { teethOf, useLiveStock } from "@/lib/useLiveStock";
import { formatPrice, type Product, type Variant } from "@/lib/types";
import Portal from "./Portal";
import { track } from "@/lib/track";

// Bottom sheet เลือกตัวเลือกสินค้า สไตล์ Shopee / TikTok Shop
// เด้งขึ้นจากล่างจอ · เลือกแล้วรูป+ราคา+สต็อกเปลี่ยนตาม · ปรับจำนวนได้
export default function VariantSheet({
  product,
  open,
  mode,
  onClose,
}: {
  product: Product;
  open: boolean;
  mode: "cart" | "buy";
  onClose: () => void;
}) {
  const hasVariants = product.v.length > 1;
  const [sel, setSel] = useState<Variant | null>(hasVariants ? null : (product.v[0] ?? null));
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (open) setQty(1);
  }, [open]);

  // ล็อกไม่ให้หน้าหลังเลื่อนตอนเปิด sheet
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // สต็อก/ราคาสดจาก ZORT — ยิงเฉพาะตอน sheet เปิด และเฉพาะตัวเลือกที่เลือกอยู่
  const querySku = open ? (sel?.k || product.v[0]?.k || product.sku || null) : null;
  const refPrice = sel ? sel.p : product.p;
  // โซ่แบบเส้น (เช่น '11.5" 22T ตัด') — ZORT นับเป็นข้อ ต้องหารเป็นจำนวนเส้น
  const perUnit = teethOf(sel?.t ?? (product.v.length === 1 ? product.v[0]?.t : undefined));
  const live = useLiveStock(querySku, { refPrice, perUnit });

  const price = live?.p ?? (sel ? sel.p : product.p);
  const stock = live?.st ?? (sel ? sel.s : product.st);
  const img = sel?.i ?? product.img;
  const max = Math.max(1, stock);

  // ถ้าสต็อกจริงน้อยกว่าจำนวนที่กดไว้ ให้ลดลงมาให้พอดี
  useEffect(() => {
    setQty((q) => Math.min(q, Math.max(1, stock)));
  }, [stock]);

  function confirm() {
    if (hasVariants && !sel) return;
    const picked = {
      productId: product.id,
      handle: product.h,
      title: product.t,
      variant: sel?.t ?? "-",
      price,
      image: img ?? "",
      sku: sel?.k || product.sku || product.v[0]?.k || "",
    };
    onClose();
    // "ซื้อเลย" แบบ Shopee — ซื้อเฉพาะชิ้นนี้ ไม่ใส่ตะกร้า ของที่ค้างในตะกร้าไม่ถูกแตะ
    // แล้วข้ามหน้าตะกร้าไปหน้าสั่งซื้อเลย (หน้านั้นปรับจำนวน/ลบของได้อยู่แล้ว)
    const ev = { items: [{ id: product.h, title: product.t, price, qty }], value: price * qty };
    if (mode === "buy") {
      setBuyNow(picked, qty);
      // "ซื้อเลย" ข้ามตะกร้า แต่ในสายตาโฆษณาก็คือหยิบใส่ตะกร้าแล้วไปจ่ายเลย
      track("AddToCart", ev);
      window.location.href = "/checkout/";
      return;
    }
    addToCart(picked, qty);
    track("AddToCart", ev);
  }

  if (!open) return null;

  // z ต้องสูงกว่าแถบซื้อที่ติดล่างจอ (z-[60]) ไม่งั้นแถบซื้อทับปุ่มยืนยันจนกดไม่ได้
  // และต้องแขวนที่ body ผ่าน Portal เผื่ออนาคตมีตัวไหนสร้างชั้นซ้อนคร่อมไว้
  return (
    <Portal>
    <div className="fixed inset-0 z-[70] flex items-end justify-center" role="dialog" aria-modal="true">
      <button aria-label="ปิด" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative max-h-[85vh] w-full ${SHELL_W} overflow-y-auto rounded-t-2xl bg-steel-800 pb-4`}>
        {/* หัว sheet: รูป + ราคา + สต็อก */}
        <div className="flex gap-3 p-3">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-white">
            {img && <Image src={img} alt={product.t} fill sizes="96px" className="object-contain" />}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className="font-heading text-xl font-semibold text-safety">{formatPrice(price)}</p>
            <p className="mt-1 text-xs text-steel-300">
              คงเหลือ {stock.toLocaleString("th-TH")} ชิ้น
              {live && <span className="ml-1.5 text-[10px] text-[#1f9254]">● เช็คคลังแล้ว</span>}
            </p>
            {sel && <p className="mt-0.5 truncate text-xs text-steel-300">SKU {sel.k}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="h-8 w-8 shrink-0 rounded-full text-xl leading-none text-steel-300"
          >
            ×
          </button>
        </div>

        <div className="h-px bg-steel-700" />

        {/* ปุ่มตัวเลือก */}
        {hasVariants && (
          <div className="p-3">
            <p className="mb-2 text-sm text-[#1a1a1a]">{product.opt ?? "ตัวเลือก"}</p>
            <div className="flex flex-wrap gap-2">
              {product.v.map((v) => {
                const out = v.s <= 0;
                const active = sel?.t === v.t;
                return (
                  <button
                    key={v.t + v.k}
                    disabled={out}
                    onClick={() => {
                      setSel(v);
                      setQty(1);
                    }}
                    className={[
                      "rounded-md border px-3 py-1.5 text-[13px] transition-colors",
                      out
                        ? "cursor-not-allowed border-steel-700 text-steel-600 line-through"
                        : active
                          ? "border-safety bg-safety/10 text-safety"
                          : "border-steel-600 text-[#1a1a1a] active:border-safety",
                    ].join(" ")}
                  >
                    {v.t}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* จำนวน */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm text-[#1a1a1a]">จำนวน</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="h-8 w-8 rounded border border-steel-600 text-lg leading-none text-[#1a1a1a]"
              aria-label="ลดจำนวน"
            >
              −
            </button>
            <span className="w-10 text-center text-base">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(max, q + 1))}
              className="h-8 w-8 rounded border border-steel-600 text-lg leading-none text-[#1a1a1a]"
              aria-label="เพิ่มจำนวน"
            >
              +
            </button>
          </div>
        </div>

        <div className="px-3 pt-2">
          <button
            onClick={confirm}
            disabled={(hasVariants && !sel) || stock <= 0}
            className="w-full rounded-lg bg-safety py-3 font-heading text-base font-semibold text-white disabled:bg-steel-700 disabled:text-steel-300"
          >
            {stock <= 0
              ? "สินค้าหมด"
              : hasVariants && !sel
                ? `กรุณาเลือก${product.opt ?? "ตัวเลือก"}`
                : mode === "buy"
                  ? "ซื้อเลย"
                  : "ใส่ตะกร้า"}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
