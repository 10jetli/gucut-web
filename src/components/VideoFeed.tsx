"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/types";
import { durLabel, videoPoster, videoSrc, type FeedItem } from "@/lib/videos";

// ใส่ <video> จริงกี่ใบรอบ ๆ ใบที่กำลังดู — ใบถัดไปโหลดรออยู่แล้ว เลื่อนถึงเล่นทันที
// เผื่อไปข้างหน้ามากกว่าข้างหลัง เพราะคนดูเลื่อนลงเป็นหลัก
// Safari บน iPhone จำกัดจำนวน <video> ที่โหลดพร้อมกัน ใส่ทั้ง 459 ใบไม่ได้
const BACK = 1;
const FWD = 2;

// ใบที่ไกลกว่านั้นวางแค่รูปปก ไกลกว่านี้อีกปล่อยว่าง ไม่งั้น HTML บวมเป็นเมกะไบต์
const POSTER = 8;

const SOUND_KEY = "gucut-video-sound";

// วางกล่องคลิปในหน้าทีละกี่ใบ — เลื่อนใกล้หมดค่อยเติมชุดถัดไป
// ถ้าวางครบทุกใบตั้งแต่แรก พอคลิปขึ้นหลักพันมือถือจะอืดตั้งแต่เปิดหน้า
const CHUNK = 20;
const GROW_AT = 8;   // เหลืออีกกี่ใบถึงจะเติมชุดใหม่

export default function VideoFeed({ first, total }: { first: FeedItem[]; total: number }) {
  const rootRef = useRef<HTMLElement>(null);
  const [items, setItems] = useState(first);
  const [shown, setShown] = useState(() => Math.min(CHUNK, first.length));
  const loading = useRef(false);
  const players = useRef(new Map<number, HTMLVideoElement>());
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [askSound, setAskSound] = useState(false);   // เบราว์เซอร์ไม่ให้เปิดเสียงเอง ต้องให้ลูกค้าแตะ
  const [ready, setReady] = useState(false);   // ใบที่ดูอยู่เล่นได้ลื่นแล้วหรือยัง
  const justUnmuted = useRef(false);           // แตะครั้งที่เปิดเสียง ห้ามหยุดคลิปไปด้วย
  const mutedRef = useRef(true);               // ค่าล่าสุด ใช้ตอนคลิปใบใหม่เพิ่งโผล่มา

  // เปลี่ยนสถานะเสียงทีเดียวทั้งฟีด — remember = จำไว้ให้ครั้งหน้าด้วยไหม
  // (ตอนเบราว์เซอร์บล็อกเสียงเอง ไม่ใช่ลูกค้าสั่ง จึงไม่ต้องจำ)
  const setMute = useCallback((m: boolean, remember = true) => {
    mutedRef.current = m;
    setMuted(m);
    for (const el of players.current.values()) el.muted = m;
    if (remember) localStorage.setItem(SOUND_KEY, m ? "off" : "on");
  }, []);

  const register = useCallback((i: number, el: HTMLVideoElement | null) => {
    // ต้องตั้งตอนนี้ ไม่งั้นคลิปใบที่เพิ่งโผล่มาจะเปิดเสียงค้างไว้ทั้งที่ทั้งฟีดปิดเสียงอยู่
    if (el) { el.muted = mutedRef.current; players.current.set(i, el); }
    else players.current.delete(i);
  }, []);

  // ดูว่าเลื่อนมาถึงคลิปไหน — เกาะที่ section ไม่ใช่ที่ <video>
  // เพราะ <video> ถูกถอดออกเมื่อเลื่อนไกลเกินหน้าต่าง
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
  }, [shown]);

  // เลื่อนใกล้หมดชุดที่วางไว้ → เติมอีกชุด
  // ถ้ากล่องที่มีในมือใกล้หมดด้วย ค่อยไปดึงรายการที่เหลือทั้งหมดมาทีเดียว
  useEffect(() => {
    if (active + GROW_AT < shown) return;
    if (shown < items.length) { setShown((n) => Math.min(n + CHUNK, items.length)); return; }
    if (items.length >= total || loading.current) return;
    loading.current = true;
    fetch("/feed.json")
      .then((r) => r.json())
      .then((all: FeedItem[]) => { setItems(all); setShown((n) => Math.min(n + CHUNK, all.length)); })
      .catch(() => { loading.current = false; });   // เน็ตสะดุด ครั้งหน้าค่อยลองใหม่
  }, [active, shown, items.length, total]);

  // ตั้งต้นคือ "เอาเสียง" เว้นแต่ลูกค้าเคยกดปิดไว้เอง
  // ถ้าเบราว์เซอร์ไม่ยอมให้เปิดเสียงเอง เดี๋ยวโค้ดข้างล่างจะถอยไปเล่นแบบเงียบให้เอง
  useEffect(() => {
    if (localStorage.getItem(SOUND_KEY) !== "off") setMute(false, false);
  }, [setMute]);

  // ใบที่อยู่ในจอเล่น ใบอื่นหยุดและกรอกลับต้นคลิป
  useEffect(() => {
    for (const [i, el] of players.current) {
      if (i !== active && !el.paused) {
        el.pause();
        el.currentTime = 0;
      }
    }
    const el = players.current.get(active);
    if (!el) return;
    setReady(el.readyState >= 3);
    el.muted = muted;
    el.play().catch(() => {
      if (el.muted) return;   // ปฏิเสธด้วยเหตุอื่น ปล่อยให้ลูกค้ากดเอง
      // เบราว์เซอร์ห้ามเล่นพร้อมเสียงถ้าลูกค้ายังไม่เคยแตะจอ
      // เล่นแบบเงียบไปก่อน แล้วขึ้นป้ายชวนให้แตะเปิดเสียง
      el.muted = true;
      setMute(true, false);
      setAskSound(true);
      el.play().catch(() => {});
    });
  }, [active, muted, setMute]);

  // แตะตรงไหนก็ได้ในฟีดครั้งแรก = เปิดเสียงให้เลย แบบเดียวกับ TikTok บนเว็บ
  // ใช้ capture แต่ไม่ขวางอะไร ปุ่มซื้อ/ลิงก์ยังกดได้ตามปกติ
  useEffect(() => {
    const root = rootRef.current;
    if (!askSound || !root) return;
    const on = () => { justUnmuted.current = true; setMute(false); setAskSound(false); };
    root.addEventListener("pointerdown", on, { once: true, capture: true });
    return () => root.removeEventListener("pointerdown", on, true);
  }, [askSound, setMute]);

  const tap = useCallback((el: HTMLVideoElement) => {
    // แตะครั้งแรกคือการเปิดเสียง อย่าให้คลิปหยุดไปด้วย
    if (justUnmuted.current) { justUnmuted.current = false; return; }
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  return (
    <main
      ref={rootRef}
      className="no-scrollbar h-[calc(100dvh-57px-env(safe-area-inset-bottom))] snap-y snap-mandatory overflow-y-auto bg-black"
    >
      {/* ปุ่มเปิด/ปิดเสียง — ใบเดียวลอยอยู่เหนือฟีด ไม่ต้องมีทุกคลิป */}
      <button
        onClick={() => { setMute(!muted); setAskSound(false); }}
        aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
        className={`fixed right-3 z-10 grid h-10 w-10 place-items-center rounded-full backdrop-blur active:bg-black/70 ${
          muted && askSound ? "animate-pulse bg-safety" : "bg-black/50"
        }`}
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

      {items.slice(0, shown).map((item, i) => {
        const d = i - active;
        const mode = d >= -BACK && d <= FWD ? "video" : Math.abs(d) <= POSTER ? "poster" : "blank";
        return (
          <Slide
            key={item.v.v}
            item={item}
            i={i}
            total={total}
            mode={mode}
            live={i === active}
            busy={i === active && !ready}
            // ใบที่ดูอยู่โหลดเต็มที่ · ใบถัดไปรอให้ใบนี้เล่นได้ก่อนค่อยโหลดตาม
            // ไม่งั้นเปิดหน้ามาแย่งเน็ตกันสามคลิป ใบแรกกว่าจะเล่นได้นาน
            eager={i === active || (i === active + 1 && ready)}
            register={register}
            onTap={tap}
            onReady={setReady}
          />
        );
      })}
    </main>
  );
}

type Mode = "video" | "poster" | "blank";

// แยกเป็นคอมโพเนนต์ที่จำค่าไว้ — เลื่อนทีนึงจะได้วาดใหม่แค่ไม่กี่ใบ
// ไม่งั้นเลื่อนทุกครั้งต้องวาดใหม่ทั้ง 459 ใบ ฟีดจะกระตุก
const Slide = memo(function Slide({
  item: { v, p },
  i,
  total,
  mode,
  live,
  busy,
  eager,
  register,
  onTap,
  onReady,
}: {
  item: FeedItem;
  i: number;
  total: number;
  mode: Mode;
  live: boolean;
  busy: boolean;
  eager: boolean;
  register: (i: number, el: HTMLVideoElement | null) => void;
  onTap: (el: HTMLVideoElement) => void;
  onReady: (b: boolean) => void;
}) {
  const poster = mode === "blank" ? undefined : videoPoster(v, 480);
  // คลิปแนวตั้งขยายเต็มจอแบบ TikTok · คลิปจัตุรัส/แนวนอนย่อให้เห็นครบ ไม่ตัดหัวตัดท้าย
  const fit = v.vw / v.vh < 0.85 ? "object-cover" : "object-contain";

  return (
    <section data-i={i} className="relative h-full w-full snap-start [scroll-snap-stop:always]">
      {mode === "video" ? (
        <video
          ref={(el) => register(i, el)}
          src={videoSrc(v)}
          poster={poster}
          // โหลดรอไว้ล่วงหน้า เลื่อนถึงแล้วเล่นทันทีไม่ต้องรอ
          preload={eager ? "auto" : "metadata"}
          loop
          playsInline
          onClick={(e) => onTap(e.currentTarget)}
          onWaiting={() => { if (live) onReady(false); }}
          onPlaying={() => { if (live) onReady(true); }}
          onCanPlay={() => { if (live) onReady(true); }}
          // คลิปเสีย/โหลดไม่ได้ อย่าให้วงหมุนค้างอยู่ ปล่อยให้เห็นรูปปกแทน
          onError={() => { if (live) onReady(true); }}
          className={`h-full w-full ${fit}`}
        />
      ) : mode === "poster" ? (
        // ใบที่ยังอยู่ไกล วางแค่รูปปกไว้ก่อน เลื่อนมาใกล้ค่อยเปลี่ยนเป็นคลิปจริง
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" loading="lazy" className={`h-full w-full ${fit}`} />
      ) : null}

      {/* วงหมุนตอนคลิปยังโหลดไม่ทัน */}
      {busy && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      )}

      {/* ป้ายชื่อคลิป + ลิงก์สินค้า overlay ด้านล่าง */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-14">
        <p className="clamp-2 text-sm font-medium drop-shadow">{v.t ?? "คลิปจากหน้าร้าน GUCUT"}</p>
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

      {/* เลขลำดับคลิป + ความยาว — อยู่ซ้าย ไม่ให้ชนปุ่มเสียงที่ลอยอยู่มุมขวา */}
      <span
        className="absolute left-3 rounded-full bg-black/50 px-2 py-0.5 text-xs tabular-nums"
        style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        {i + 1}/{total} · {durLabel(v.dur)}
      </span>
    </section>
  );
});
