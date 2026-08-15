"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { clearBuyNow, getCart, updateQty, removeItem, type CartItem } from "@/lib/cart";
import Price from "@/components/Price";

// หน้าตะกร้า — หน้าตาชุดเดียวกับหน้าสั่งซื้อ (การ์ดขาว · ปุ่ม − จำนวน + · ลบ)
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
        <Link href="/" className="rounded-sm bg-safety px-5 py-2.5 font-heading text-sm font-bold text-white">
          เลือกซื้อสินค้า
        </Link>
      </main>
    );
  }

  const pieces = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <main className="min-h-[100dvh] bg-steel-900 pb-32">
      <header className="sticky top-0 z-40 border-b-[3px] border-safety bg-carbon px-3 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        {/* นับเป็น "ชิ้น" ให้ตรงกับตัวเลขแดงที่เมนูล่าง ไม่งั้นสองที่ไม่ตรงกันแล้วลูกค้าสงสัย */}
        <h1 className="font-heading text-[15px] font-bold text-white">
          ตะกร้าสินค้า ({pieces} ชิ้น)
        </h1>
      </header>

      {/* การ์ดขาวขอบมนลอยบนพื้นเทา — ชุดเดียวกับหน้าสั่งซื้อ */}
      <section className="mx-2 mt-2 overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        {items.map((it, n) => (
          // ใส่ลำดับไว้ในคีย์ด้วย — กันแถวหายถ้าข้อมูลเก่ามีบรรทัดซ้ำกัน
          <div key={`${n}-${it.productId}-${it.variant}`} className="flex gap-2.5 border-b border-steel-800 p-3 last:border-0">
            <Link
              href={`/products/${encodeURIComponent(it.handle)}`}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded border border-steel-700 bg-white"
            >
              {it.image ? (
                <Image src={it.image} alt={it.title} fill sizes="80px" className="object-contain" />
              ) : (
                <span className="flex h-full items-center justify-center text-[10px] text-steel-600">ไม่มีรูป</span>
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <Link href={`/products/${encodeURIComponent(it.handle)}`} className="clamp-2 text-[13px] leading-snug text-[#1a1a1a]">
                {it.title}
              </Link>
              {it.variant && it.variant !== "-" && (
                <p className="mt-0.5 text-[11px] text-steel-300">{it.variant}</p>
              )}
              <div className="mt-auto flex items-center gap-2 pt-1.5">
                <Price value={it.price} className="flex-1 font-heading text-[15px] font-semibold text-safety" />
                <Stepper qty={it.qty} onChange={(q) => updateQty(it.productId, it.variant, q)} />
                <button
                  onClick={() => removeItem(it.productId, it.variant)}
                  className="text-[12px] text-steel-300 underline"
                >
                  ลบ
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* แถบสรุปยอด + ปุ่มเช็คเอาต์ — ลอยเหนือเมนูล่าง */}
      <div className="fixed inset-x-0 bottom-[57px] z-40 mx-auto max-w-lg border-t border-steel-700 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-steel-300">ยอดรวม</p>
            <Price value={total} className="font-heading text-[18px] font-bold text-safety" />
          </div>
          {/* ล้างของที่ค้างจากปุ่ม "ซื้อเลย" ก่อน — ไม่งั้นหน้าสั่งซื้อจะโชว์ชิ้นเดียวแทนทั้งตะกร้า */}
          <Link
            href="/checkout"
            onClick={() => clearBuyNow()}
            className="shrink-0 rounded-sm bg-safety px-10 py-3 font-heading text-[15px] font-bold text-white active:scale-[0.98]"
          >
            สั่งสินค้า
          </Link>
        </div>
      </div>
    </main>
  );
}

// ปุ่ม − จำนวน + ชุดเดียวกับหน้าสั่งซื้อ
function Stepper({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  const btn =
    "flex h-7 w-7 items-center justify-center border border-steel-700 text-[15px] leading-none text-[#1a1a1a] disabled:text-steel-600";
  return (
    <span className="flex items-center">
      <button onClick={() => onChange(qty - 1)} disabled={qty <= 1} aria-label="ลดจำนวน" className={btn + " rounded-l-sm"}>−</button>
      <span className="flex h-7 min-w-9 items-center justify-center border-y border-steel-700 px-1 text-[13px] tabular-nums">{qty}</span>
      <button onClick={() => onChange(qty + 1)} aria-label="เพิ่มจำนวน" className={btn + " rounded-r-sm"}>+</button>
    </span>
  );
}
