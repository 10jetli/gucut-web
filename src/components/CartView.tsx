"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getCart, updateQty, removeItem, cartTotal, type CartItem } from "@/lib/cart";
import { formatPrice } from "@/lib/types";

// หน้าตะกร้า — แก้จำนวน/ลบได้ (เช็คเอาต์ QR PromptPay จะมาในขั้นถัดไป)
export default function CartView() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = () => setItems(getCart());
    load();
    setReady(true);
    window.addEventListener("cart-updated", load);
    return () => window.removeEventListener("cart-updated", load);
  }, []);

  if (!ready) return null;

  if (items.length === 0) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">🛒</span>
        <h1 className="font-heading text-xl font-bold">ตะกร้ายังว่างอยู่</h1>
        <Link href="/" className="rounded-lg bg-safety px-5 py-2.5 font-heading text-sm font-bold text-white">
          เลือกซื้อสินค้า
        </Link>
      </main>
    );
  }

  return (
    <main className="pb-28">
      <header className="sticky top-0 z-40 bg-steel-900/95 px-4 pb-3 backdrop-blur pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <h1 className="font-heading text-lg font-bold">ตะกร้าสินค้า ({items.length})</h1>
      </header>

      <ul className="space-y-2 px-3">
        {items.map((it) => (
          <li key={`${it.productId}-${it.variant}`} className="flex gap-3 rounded-lg bg-steel-800 p-2.5">
            <Link href={`/products/${encodeURIComponent(it.handle)}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-white">
              <Image src={it.image} alt={it.title} fill sizes="80px" className="object-contain" />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="clamp-2 text-[13px] leading-tight">{it.title}</p>
              <p className="mt-0.5 text-[11px] text-steel-300">{it.variant}</p>
              <div className="mt-auto flex items-center justify-between">
                <span className="font-heading font-semibold text-safety">{formatPrice(it.price)}</span>
                <div className="flex items-center gap-1">
                  <QtyBtn label="−" onClick={() => updateQty(it.productId, it.variant, it.qty - 1)} />
                  <span className="w-7 text-center text-sm tabular-nums">{it.qty}</span>
                  <QtyBtn label="+" onClick={() => updateQty(it.productId, it.variant, it.qty + 1)} />
                  <button
                    onClick={() => removeItem(it.productId, it.variant)}
                    className="ml-2 text-xs text-steel-300 underline"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* แถบสรุปยอด + ปุ่มเช็คเอาต์ ติดล่างจอ */}
      <div className="fixed inset-x-0 bottom-[57px] z-40 border-t border-steel-700 bg-steel-800/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs text-steel-300">ยอดรวม</p>
            <p className="font-heading text-lg font-bold text-safety">{formatPrice(cartTotal())}</p>
          </div>
          <Link
            href="/checkout"
            className="rounded-lg bg-safety px-6 py-2.5 font-heading text-sm font-bold text-white active:scale-[0.98]"
          >
            เช็คเอาต์
          </Link>
        </div>
      </div>
    </main>
  );
}

function QtyBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded border border-steel-600 text-sm leading-none"
    >
      {label}
    </button>
  );
}
