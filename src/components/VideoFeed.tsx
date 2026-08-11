"use client";

import Image from "next/image";
import Link from "next/link";
import { videos, CHANNEL_URL } from "@/lib/videos";
import { formatPrice, type Product } from "@/lib/types";

// feed วิดีโอแนวตั้งแบบ TikTok — เลื่อนทีละคลิป (snap)
export default function VideoFeed({ products }: { products: Product[] }) {
  return (
    <main className="no-scrollbar h-[calc(100dvh-57px)] snap-y snap-mandatory overflow-y-auto bg-black">
      {videos.map((v, i) => {
        const product = products.find((p) => p.h === v.productHandle);
        return (
          <section key={i} className="relative h-full w-full snap-start">
            {v.youtubeId ? (
              // ฝังคลิปจริงจาก YouTube
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${v.youtubeId}?playsinline=1&rel=0`}
                title={v.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              // placeholder ระหว่างรอใส่ youtubeId จริง (ดู src/lib/videos.ts)
              <div className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-b from-steel-800 to-black px-8 text-center">
                {product && (
                  <div className="relative h-44 w-44 overflow-hidden rounded-2xl bg-white">
                    <Image src={product.img ?? ""} alt={v.title} fill sizes="176px" className="object-contain" />
                  </div>
                )}
                <span className="text-5xl">▶</span>
                <p className="font-heading text-lg font-semibold leading-snug">{v.title}</p>
                <a
                  href={CHANNEL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white"
                >
                  ▶ ดูที่ช่อง NEWWAVE Legends
                </a>
              </div>
            )}

            {/* ป้ายชื่อคลิป + ลิงก์สินค้า overlay ด้านล่าง */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-14">
              <p className="text-sm font-medium drop-shadow">{v.title}</p>
              {product && (
                <Link
                  href={`/products/${encodeURIComponent(product.h)}`}
                  className="pointer-events-auto mt-2 flex items-center gap-2 rounded-lg bg-steel-800/90 p-2 backdrop-blur"
                >
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-white">
                    <Image src={product.img ?? ""} alt={product.t} fill sizes="40px" className="object-contain" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="clamp-2 block text-xs leading-tight">{product.t}</span>
                    <span className="font-heading text-sm font-bold text-safety">{formatPrice(product.p)}</span>
                  </span>
                  <span className="rounded-md bg-safety px-3 py-1.5 text-xs font-bold text-white">ซื้อเลย</span>
                </Link>
              )}
            </div>

            {/* เลขลำดับคลิป */}
            <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-xs">
              {i + 1}/{videos.length}
            </span>
          </section>
        );
      })}
    </main>
  );
}
