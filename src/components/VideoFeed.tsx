"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/types";
import { durLabel, videoPoster, videoSrc, type FeedItem } from "@/lib/videos";

// จำนวนคลิปรอบ ๆ ใบที่กำลังดูที่ใส่ <video> จริง ที่เหลือโชว์แค่รูปปก
// Safari บน iPhone จำกัดจำนวน <video> ที่โหลดพร้อมกัน ถ้าใส่ครบ 459 ใบจะพัง
const WINDOW = 2;

// รูปปกวางล่วงหน้าได้เยอะกว่า (แค่รูป ไม่กินสิทธิ์ media element)
// แต่ไม่วางครบทุกใบ ไม่งั้น HTML หน้าเดียวบวมเป็นเมกะไบต์
const POSTER_WINDOW = 8;

// feed วิดีโอแนวตั้งแบบ TikTok — เลื่อนทีละคลิป (snap)
// คลิปที่อยู่ในจอเล่นเอง คลิปที่เลื่อนผ่านไปหยุดและกรอกลับต้นคลิป
export default function VideoFeed({ items }: { items: FeedItem[] }) {
  const rootRef = useRef<HTMLElement>(null);
  const players = useRef(new Map<number, HTMLVideoElement>());
  const [muted, setMuted] = useState(true);   // มือถือจะยอมเล่นเองก็ต่อเมื่อปิดเสียง
  const [active, setActive] = useState(0);

  const bind = useCallback((i: number) => (el: HTMLVideoElement | null) => {
    if (el) players.current.set(i, el);
    else players.current.delete(i);
  }, []);

  // ดูว่าตอนนี้เลื่อนมาถึงคลิปไหน — เกาะที่ section ไม่ใช่ที่ <video>
  // เพราะ <video> ถูกถอดออกเมื่อเลื่อนไกลเกิน WINDOW
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            setActive(Number((e.target as HTMLElement).dataset.i));
          }
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("section[data-i]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // ใบที่อยู่ในจอเล่น ใบอื่นหยุดและกรอกลับต้นคลิป
  useEffect(() => {
    for (const [i, el] of players.current) {
      if (i === active) {
        // เบราว์เซอร์อาจปฏิเสธถ้าลูกค้ายังไม่เคยแตะจอ — ไม่เป็นไร กดเล่นเองได้
        el.play().catch(() => {});
      } else if (!el.paused) {
        el.pause();
        el.currentTime = 0;
      }
    }
  }, [active]);

  // สลับเสียงทีเดียวทั้งฟีด ไม่ใช่ทีละคลิป
  useEffect(() => {
    for (const el of players.current.values()) el.muted = muted;
  }, [muted, active]);

  return (
    <main
      ref={rootRef}
      className="no-scrollbar h-[calc(100dvh-57px-env(safe-area-inset-bottom))] snap-y snap-mandatory overflow-y-auto bg-black"
    >
      {/* ปุ่มเปิด/ปิดเสียง — ใบเดียวลอยอยู่เหนือฟีด ไม่ต้องมีทุกคลิป */}
      <button
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
        className="fixed right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/50 backdrop-blur active:bg-black/70"
        style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
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

      {items.map(({ v, p }, i) => {
        const d = Math.abs(i - active);
        const near = d <= WINDOW;
        const poster = d <= POSTER_WINDOW ? videoPoster(v) : undefined;
        return (
          <section key={v.v} data-i={i} className="relative h-full w-full snap-start">
            {near ? (
              <video
                ref={bind(i)}
                src={videoSrc(v)}
                poster={poster}
                // preload="none" — ไม่งั้นเลื่อนทีเดียวสั่งโหลดหลายคลิปพร้อมกัน
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
            ) : poster ? (
              // ใบที่ยังอยู่ไกล วางแค่รูปปกไว้ก่อน เลื่อนมาใกล้ค่อยเปลี่ยนเป็นคลิปจริง
              // eslint-disable-next-line @next/next/no-img-element
              <img src={poster} alt="" loading="lazy" className="h-full w-full object-contain" />
            ) : null}

            {/* ป้ายชื่อคลิป + ลิงก์สินค้า overlay ด้านล่าง */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-14">
              <p className="clamp-2 text-sm font-medium drop-shadow">
                {v.t ?? "คลิปจากหน้าร้าน GUCUT"}
              </p>
              {p ? (
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
              ) : (
                // คลิปที่ไม่ได้ผูกกับสินค้าไว้ใน Shopify — พาไปหน้าหมวดหมู่แทน
                <Link
                  href="/categories/"
                  className="pointer-events-auto mt-2 flex items-center justify-center gap-1 rounded-lg border border-white/25 bg-black/40 py-2 text-xs font-medium backdrop-blur"
                >
                  ดูสินค้าทั้งหมดของร้าน ›
                </Link>
              )}
            </div>

            {/* เลขลำดับคลิป + ความยาว */}
            <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-xs tabular-nums">
              {i + 1}/{items.length} · {durLabel(v.dur)}
            </span>
          </section>
        );
      })}
    </main>
  );
}
