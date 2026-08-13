"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/types";
import { durLabel, videoPoster, videoSrc, type FeedItem } from "@/lib/videos";

// feed วิดีโอแนวตั้งแบบ TikTok — เลื่อนทีละคลิป (snap)
// คลิปที่อยู่ในจอเล่นเอง คลิปที่เลื่อนผ่านไปหยุดเอง
export default function VideoFeed({ items }: { items: FeedItem[] }) {
  const rootRef = useRef<HTMLElement>(null);
  const [muted, setMuted] = useState(true);   // มือถือจะยอมเล่นเองก็ต่อเมื่อปิดเสียง
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const clips = Array.from(root.querySelectorAll("video"));

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLVideoElement;
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            setActive(Number(el.dataset.i));
            // เบราว์เซอร์อาจปฏิเสธถ้าลูกค้ายังไม่เคยแตะจอ — ไม่เป็นไร กดเล่นเองได้
            el.play().catch(() => {});
          } else if (!el.paused) {
            el.pause();
            el.currentTime = 0;   // เลื่อนกลับมาดูใหม่ให้เริ่มต้นคลิปเสมอ
          }
        }
      },
      { root, threshold: [0, 0.6, 1] },
    );

    clips.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  // สลับเสียงทีเดียวทั้งฟีด ไม่ใช่ทีละคลิป
  useEffect(() => {
    rootRef.current?.querySelectorAll("video").forEach((c) => {
      (c as HTMLVideoElement).muted = muted;
    });
  }, [muted]);

  return (
    <main
      ref={rootRef}
      className="no-scrollbar h-[calc(100dvh-57px-env(safe-area-inset-bottom))] snap-y snap-mandatory overflow-y-auto bg-black"
    >
      {items.map(({ v, p }, i) => (
        <section key={v.id} className="relative h-full w-full snap-start">
          <video
            data-i={i}
            src={videoSrc(v)}
            poster={videoPoster(v)}
            // preload="none" — ไม่งั้นเปิดหน้านี้ทีเดียวโหลด 113 คลิปพร้อมกัน
            preload="none"
            muted
            loop
            playsInline
            onClick={(e) => {
              const el = e.currentTarget;
              if (el.paused) el.play().catch(() => {});
              else el.pause();
            }}
            className="h-full w-full object-contain"
          />

          {/* ปุ่มเปิด/ปิดเสียง — ค้างอยู่ที่เดิมทุกคลิป */}
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
            className="absolute right-3 top-14 grid h-10 w-10 place-items-center rounded-full bg-black/50 backdrop-blur active:bg-black/70"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-white stroke-[2]">
              <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" strokeLinejoin="round" />
              {muted ? (
                <path d="M16 9.5l4.5 5m0-5l-4.5 5" strokeLinecap="round" />
              ) : (
                <path d="M16 9a4.5 4.5 0 010 6M18.5 6.5a8 8 0 010 11" strokeLinecap="round" />
              )}
            </svg>
          </button>

          {/* ป้ายชื่อคลิป + ลิงก์สินค้า overlay ด้านล่าง */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-14">
            <p className="clamp-2 text-sm font-medium drop-shadow">{v.t}</p>
            {p && (
              <Link
                href={`/products/${encodeURIComponent(p.h)}/`}
                className="pointer-events-auto mt-2 flex items-center gap-2 rounded-lg bg-steel-800/90 p-2 backdrop-blur"
              >
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-white">
                  {p.img && <Image src={p.img} alt="" fill sizes="40px" className="object-contain" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="clamp-2 block text-xs leading-tight">{p.t}</span>
                  <span className="font-heading text-sm font-bold text-safety">{formatPrice(p.p)}</span>
                </span>
                <span className="rounded-md bg-safety px-3 py-1.5 text-xs font-bold text-white">ซื้อเลย</span>
              </Link>
            )}
          </div>

          {/* เลขลำดับคลิป + ความยาว */}
          <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-xs tabular-nums">
            {i + 1}/{items.length} · {durLabel(v.dur)}
          </span>
        </section>
      ))}

      {/* ตัวช่วยบอกว่าคลิปไหนกำลังเล่น — ใช้ค่า active ที่ observer อัปเดตให้ */}
      <span className="sr-only" aria-live="polite">
        คลิปที่ {active + 1} จาก {items.length}
      </span>
    </main>
  );
}
