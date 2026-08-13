"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import SectionHead from "@/components/SectionHead";
import { formatPrice, discountPercent, type Product } from "@/lib/types";

// นับถอยหลังถึงเที่ยงคืนวันนี้
function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    const tick = () => {
      const end = new Date();
      end.setHours(24, 0, 0, 0);
      setLeft(Math.max(0, end.getTime() - Date.now()));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor(left / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return [pad(Math.floor(s / 3600)), pad(Math.floor((s % 3600) / 60)), pad(s % 60)];
}

export default function FlashSale({ items }: { items: Product[] }) {
  const [h, m, s] = useCountdown();

  return (
    <section className="mt-5">
      <SectionHead title="FLASH SALE" href="/categories/">
        {/* ตัวนับถอยหลังถึงเที่ยงคืน — ตัวเลขขาวบนพื้นส้ม อ่านชัดบนมือถือ */}
        <div className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold">
          {[h, m, s].map((v, i) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-safety">:</span>}
              <span className="rounded-sm bg-safety px-1.5 py-1 tabular-nums text-white">{v}</span>
            </span>
          ))}
        </div>
      </SectionHead>

      {/* แถวสินค้าเลื่อนแนวนอน */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-1">
        {items.map((p) => (
          <Link
            key={p.id}
            href={`/products/${encodeURIComponent(p.h)}`}
            className="w-28 shrink-0 overflow-hidden rounded-lg bg-steel-800 active:scale-[0.97]"
          >
            <div className="relative aspect-square bg-white">
              <Image src={p.img ?? ""} alt={p.t} fill sizes="112px" className="object-contain" />
              {discountPercent(p) > 0 && (
                <span className="absolute left-0 top-0 rounded-br-lg bg-safety px-1.5 py-0.5 text-[10px] font-bold">
                  -{discountPercent(p)}%
                </span>
              )}
            </div>
            <div className="p-1.5 text-center">
              <p className="font-heading text-sm font-semibold text-safety">{formatPrice(p.p)}</p>
              <p className="mt-0.5 text-[10px] text-steel-300">เหลือ {p.st.toLocaleString("th-TH")}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
