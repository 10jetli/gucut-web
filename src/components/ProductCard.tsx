import Image from "next/image";
import Link from "next/link";
import Stars from "./Stars";
import { compactCount, discountPercent, type Product } from "@/lib/types";
import Price from "@/components/Price";

// การ์ดสินค้าแบบ Shopee/TikTok Shop — รูปสี่เหลี่ยมจัตุรัส ป้าย %ลด ราคาส้ม สต็อกจริง
export default function ProductCard({ product: p }: { product: Product }) {
  const off = discountPercent(p);
  return (
    <Link
      href={`/products/${encodeURIComponent(p.h)}`}
      className="overflow-hidden rounded-sm border border-steel-700 bg-white transition-transform active:scale-[0.97]"
    >
      <div className="relative aspect-square bg-white">
        {p.img ? (
          <Image
            src={p.img}
            alt={p.t}
            fill
            sizes="(max-width: 512px) 50vw, 256px"
            className="object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-steel-600">
            ไม่มีรูป
          </div>
        )}
        {off > 0 && (
          <span className="absolute right-0 top-0 rounded-bl-lg bg-safety px-1.5 py-0.5 text-xs font-bold text-white">
            -{off}%
          </span>
        )}
        {p.st <= 0 && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white">
            สินค้าหมด
          </span>
        )}
        {p.v.length > 1 && (
          <span className="absolute bottom-0 left-0 rounded-tr bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
            {p.v.length} ตัวเลือก
          </span>
        )}
      </div>
      <div className="p-2">
        <p className="clamp-2 min-h-[2.5rem] text-[13px] leading-tight text-[#1a1a1a]">{p.t}</p>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <Price value={p.p} className="font-heading text-[15px] font-semibold text-safety" />
          {p.c && p.c > p.p && (
            <span className="text-[11px] text-steel-300 line-through">
              ฿{p.c.toLocaleString("th-TH")}
            </span>
          )}
        </div>
        {p.rv ? (
          <p className="mt-0.5 flex items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] text-steel-300">
            <Stars value={p.rv.a} size={11} />
            <span>{p.rv.a.toFixed(1)}</span>
            <span className="text-steel-600">|</span>
            <span>{compactCount(p.rv.n)} รีวิว</span>
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-steel-300">
            {p.st > 0 ? `คงเหลือ ${p.st.toLocaleString("th-TH")} ชิ้น` : "สินค้าหมด"}
          </p>
        )}
      </div>
    </Link>
  );
}
