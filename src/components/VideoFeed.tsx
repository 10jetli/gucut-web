"use client";

import Image from "next/image";
import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/types";
import { durLabel, prefetchVideo, usingHls, videoPoster, videoSrc, VIDEO_HOST, type FeedItem } from "@/lib/videos";
import { isSafariHls, useHls } from "@/lib/useHls";
import VideoActions from "./VideoActions";
import VideoComments from "./VideoComments";
import { fetchCounts, likedIds, savedIds, type VideoCounts } from "@/lib/social";

// ใส่ <video> จริงกี่ใบรอบ ๆ ใบที่กำลังดู — ใบถัดไปโหลดรออยู่แล้ว เลื่อนถึงเล่นทันที
// เผื่อไปข้างหน้ามากกว่าข้างหลัง เพราะคนดูเลื่อนลงเป็นหลัก
// Safari บน iPhone จำกัดจำนวน <video> ที่โหลดพร้อมกัน ใส่ทั้ง 459 ใบไม่ได้
const BACK = 1;
const FWD = 2;

// ใบที่ไกลกว่านั้นวางแค่รูปปก ไกลกว่านี้อีกปล่อยว่าง ไม่งั้น HTML บวมเป็นเมกะไบต์
const POSTER = 8;

const SOUND_KEY = "gucut-video-sound";
const SEEN_KEY = "gucut-video-seen";

// ดูคลิปค้างไว้นานเท่านี้ถือว่า "ดูแล้ว" — ครั้งหน้าจะไม่เอามาวนซ้ำต้นฟีด
const SEEN_SEC = 5;
// จำได้สูงสุดกี่ใบ กันไม่ให้ localStorage บวม (ร้านจะมีคลิปเป็นพัน)
const SEEN_MAX = 3000;

const readSeen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); } catch { return []; }
};

// วางกล่องคลิปในหน้าทีละกี่ใบ — เลื่อนใกล้หมดค่อยเติมชุดถัดไป
// ถ้าวางครบทุกใบตั้งแต่แรก พอคลิปขึ้นหลักพันมือถือจะอืดตั้งแต่เปิดหน้า
const CHUNK = 20;
const GROW_AT = 8;   // เหลืออีกกี่ใบถึงจะเติมชุดใหม่

// จัดอันดับฟีดแบบ TikTok — คลิปที่คนกดหัวใจเยอะมีโอกาสขึ้นก่อน แต่สุ่มใหม่ทุกครั้งที่เปิด
// เปิดสิบครั้งจะไม่เจอลำดับเดิมสิบครั้ง แต่ใบที่คนชอบก็ยังลอยขึ้นมาบ่อยกว่า
// (ใบที่เคยดูแล้วดันไปท้ายเสมอ ไม่ว่าจะดังแค่ไหน)
function rankFeed(list: FeedItem[], counts: VideoCounts, seen: Set<string>): FeedItem[] {
  const score = new Map<string, number>();
  for (const it of list) {
    const likes = counts[it.v.v]?.[0] ?? 0;
    const shoppable = it.p ? 1.4 : 1;             // คลิปที่กดซื้อได้ ดันขึ้นอีกนิด
    score.set(it.v.v, (likes + 1) * shoppable * (0.5 + Math.random()));
  }
  const by = (a: FeedItem, b: FeedItem) => (score.get(b.v.v) ?? 0) - (score.get(a.v.v) ?? 0);
  return [
    ...list.filter((x) => !seen.has(x.v.v)).sort(by),
    ...list.filter((x) => seen.has(x.v.v)).sort(by),
  ];
}

export default function VideoFeed({ first, total }: { first: FeedItem[]; total: number }) {
  const rootRef = useRef<HTMLElement>(null);
  const [items, setItems] = useState(first);
  const seen = useRef<Set<string>>(new Set());
  const [shown, setShown] = useState(() => Math.min(CHUNK, first.length));
  const loading = useRef(false);
  const itemsRef = useRef(first);
  const players = useRef(new Map<number, HTMLVideoElement>());
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);          // ให้ตัวฟังจังหวะแตะอ่านได้โดยไม่ต้องรอ render
  const [muted, setMuted] = useState(true);
  const [askSound, setAskSound] = useState(false);   // เบราว์เซอร์ไม่ให้เปิดเสียงเอง ต้องให้ลูกค้าแตะ
  const [ready, setReady] = useState(false);   // ใบที่ดูอยู่เล่นได้ลื่นแล้วหรือยัง
  const justUnmuted = useRef(false);           // แตะครั้งที่เปิดเสียง ห้ามหยุดคลิปไปด้วย
  const mutedRef = useRef(true);               // ค่าล่าสุด ใช้ตอนคลิปใบใหม่เพิ่งโผล่มา

  // ---- หัวใจ / คอมเมนต์ / บันทึก ----
  const [counts, setCounts] = useState<VideoCounts>({});
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const say = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  // ตัวเลขถูกใจของใบนั้น — ขยับในเครื่องทันทีที่กด ไม่ต้องรอเซิร์ฟเวอร์ตอบ
  const bumpLike = useCallback((id: string, on: boolean) => {
    setLiked((cur) => { const n = new Set(cur); if (on) n.add(id); else n.delete(id); return n; });
    setCounts((cur) => {
      const [l = 0, c = 0] = cur[id] ?? [];
      return { ...cur, [id]: [Math.max(0, l + (on ? 1 : -1)), c] };
    });
  }, []);

  const markSaved = useCallback((id: string, on: boolean) => {
    setSaved((cur) => { const n = new Set(cur); if (on) n.add(id); else n.delete(id); return n; });
  }, []);

  // เปลี่ยนสถานะเสียงทีเดียวทั้งฟีด — remember = จำไว้ให้ครั้งหน้าด้วยไหม
  // (ตอนเบราว์เซอร์บล็อกเสียงเอง ไม่ใช่ลูกค้าสั่ง จึงไม่ต้องจำ)
  const setMute = useCallback((m: boolean, remember = true) => {
    mutedRef.current = m;
    setMuted(m);
    for (const el of players.current.values()) el.muted = m;
    if (remember) localStorage.setItem(SOUND_KEY, m ? "off" : "on");
  }, []);

  itemsRef.current = items;

  const register = useCallback((i: number, el: HTMLVideoElement | null) => {
    // ต้องตั้งตอนนี้ ไม่งั้นคลิปใบที่เพิ่งโผล่มาจะเปิดเสียงค้างไว้ทั้งที่ทั้งฟีดปิดเสียงอยู่
    if (el) {
      el.muted = mutedRef.current;
      // iOS บางรุ่นเช็ค "attribute" muted ตอนตัดสินว่าให้เล่นเองได้ไหม ไม่ใช่แค่ property
      // (React ก็มีบั๊กเก่าแก่ที่ไม่เขียน attribute นี้ให้จาก prop) — ใส่เองให้ชัวร์
      if (mutedRef.current) el.setAttribute("muted", "");
      players.current.set(i, el);
      return;
    }
    // ⚠️ ถอดกล่องคลิปออกจากหน้าแล้วมันยังเล่นต่อได้ เบราว์เซอร์ไม่หยุดให้เอง
    //    เคยทำให้เลื่อนผ่านไปแล้วเสียงคลิปเก่ายังดังอยู่ — ต้องสั่งหยุดเองตรงนี้
    const gone = players.current.get(i);
    if (gone) {
      gone.pause();
      gone.removeAttribute("src");
      gone.load();
    }
    players.current.delete(i);
  }, []);

  // ดูว่าเลื่อนมาถึงคลิปไหน — คิดจากตำแหน่งการเลื่อนตรง ๆ
  //
  // ⚠️ เคยใช้ IntersectionObserver แล้วพลาดมาแล้ว (17 ส.ค. 2569)
  //    ตั้ง threshold: [0.6] แล้วเช็ค ratio > 0.6 — ตัวสังเกตจะแจ้งตอน "ข้ามเส้น"
  //    ด้วยค่าประมาณ 0.6 พอดี เงื่อนไข "มากกว่า 0.6" จึงเป็นเท็จ ไม่เคยอัปเดตเลย
  //    ระบบคิดว่ายังอยู่ใบเดิมตลอด → ใบเก่าไม่ถูกหยุด ใบใหม่ไม่ถูกสั่งเล่น
  //
  //    ฟีดนี้เลื่อนแบบ snap ทีละหน้าจอเต็ม ๆ อยู่แล้ว การหารตำแหน่งเลื่อนด้วย
  //    ความสูงหนึ่งหน้าจอจึงได้เลขใบที่แม่นกว่า ไม่ต้องพึ่งค่าทศนิยมของใคร
  //    (แอปฟีดวิดีโอทั่วไปก็ใช้วิธีนี้ ไม่ได้พึ่ง IntersectionObserver อย่างเดียว)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let raf = 0;
    const calc = () => {
      raf = 0;
      const h = root.clientHeight || 1;
      const n = Math.round(root.scrollTop / h);
      if (n !== activeRef.current && n >= 0) {
        activeRef.current = n;
        setActive(n);
      }
    };
    const onScroll = () => {
      if (raf) return;                       // รวบหลายเหตุการณ์ให้เหลือเฟรมละครั้ง
      raf = requestAnimationFrame(calc);
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    // เผื่อกรณีที่ scroll ไม่ยิง (เปลี่ยนขนาดจอ / หมุนเครื่อง)
    window.addEventListener("resize", onScroll);
    calc();                                   // ตั้งค่าเริ่มต้นให้ถูกตั้งแต่เปิดหน้า

    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

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

  // เริ่มโหลดตัวเล่น hls.js ทันทีที่เปิดหน้า ไม่ต้องรอให้คลิปใบแรกพร้อม
  // (เดิมโหลดตอน <video> ใบแรกโผล่ ทำให้ต่อคิวกันอีกทอด — บนมือถือกินเป็นวินาที)
  // iPhone เล่น HLS เองได้อยู่แล้ว จึงข้ามไปเลย ไม่ต้องโหลดไลบรารีให้เปลืองเน็ต
  useEffect(() => {
    if (usingHls && !isSafariHls()) import("hls.js").catch(() => {});
  }, []);

  // เปิดหน้ามา — โหลดรายการเต็ม + ยอดถูกใจ แล้วจัดอันดับใหม่
  //   ใบที่ยังไม่เคยดูขึ้นก่อนเสมอ · ในกลุ่มนั้นใบที่คนกดหัวใจเยอะมีโอกาสขึ้นก่อน + สุ่ม
  //   ?v=<คลิป>  เปิดจากลิงก์ที่เพื่อนแชร์มา → ใบนั้นขึ้นก่อน
  //   ?saved=1   ดูเฉพาะคลิปที่บันทึกไว้
  useEffect(() => {
    seen.current = new Set(readSeen());
    setLiked(likedIds());
    const savedList = savedIds();
    setSaved(new Set(savedList));

    const q = new URLSearchParams(window.location.search);
    const want = q.get("v");
    const onlySaved = q.get("saved") === "1";

    Promise.all([
      fetch("/feed.json").then((r) => r.json()).catch(() => null),
      fetchCounts(),
      // สินค้าที่ร้านผูกกับคลิปเองจากหลังร้าน (ผูกแล้วขึ้นทันที ไม่ต้องรอ deploy)
      fetch("/api/clip-shop").then((r) => r.json()).then((d) => d.map ?? {}).catch(() => ({})),
    ]).then(([all, c, shop]) => {
      setCounts(c);
      if (!all) return;   // เน็ตสะดุด ใช้ชุดที่ฝังมากับหน้าไปก่อน
      // เติมสินค้าให้คลิปที่ยังไม่มี — ของที่ผูกมากับ Shopify เดิมมาก่อนเสมอ
      const withShop = (all as FeedItem[]).map((x) =>
        x.p || !shop[x.v.v] ? x : { ...x, p: shop[x.v.v] },
      );
      all = withShop;
      const pool: FeedItem[] = onlySaved
        ? (all as FeedItem[]).filter((x) => savedList.includes(x.v.v))
        : (all as FeedItem[]);
      if (!pool.length) {
        if (onlySaved) say("ยังไม่มีคลิปที่บันทึกไว้ — กดรูปธงที่คลิปเพื่อเก็บไว้ดูทีหลัง");
        return;
      }
      const ranked = rankFeed(pool, c, seen.current);
      // ใบที่กำลังเล่นอยู่ต้องคาที่เดิม ไม่งั้นจอสลับคลิปกลางคันตอนตัวเลขโหลดเสร็จ
      const pin = want ? pool.find((x) => x.v.v === want) : itemsRef.current[0];
      const rest = ranked.filter((x) => x.v.v !== pin?.v.v);
      setItems(pin ? [pin, ...rest] : rest);
    });
    // ตั้งใจให้รันครั้งเดียวตอนเปิดหน้า — say ไม่เปลี่ยนตัวตนอยู่แล้ว
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ตั้งต้นคือ "เอาเสียง" เว้นแต่ลูกค้าเคยกดปิดไว้เอง
  // ถ้าเบราว์เซอร์ไม่ยอมให้เปิดเสียงเอง เดี๋ยวโค้ดข้างล่างจะถอยไปเล่นแบบเงียบให้เอง
  useEffect(() => {
    if (localStorage.getItem(SOUND_KEY) !== "off") setMute(false, false);
  }, [setMute]);

  // ชิงโหลดคลิปใบถัดไปไว้ตั้งแต่ตอนที่ยังดูใบนี้อยู่ — เลื่อนถึงแล้วเล่นทันที
  // ใบแรกก็ชิงโหลดตั้งแต่เปิดหน้า ขนานไปกับตอนที่เบราว์เซอร์ยังโหลดตัวเล่นอยู่
  useEffect(() => {
    prefetchVideo(items[active]?.v);
    // ใบถัดไปรอให้ใบที่ดูอยู่เล่นได้ก่อน ไม่งั้นสองใบแย่งเน็ตกันตั้งแต่วินาทีแรก
    if (ready) prefetchVideo(items[active + 1]?.v);
  }, [active, items, ready]);

  // ใบที่อยู่ในจอเล่น ใบอื่นหยุดและกรอกลับต้นคลิป
  useEffect(() => {
    for (const [i, el] of players.current) {
      if (i !== active) {
        // ดูค้างไว้นานพอ = ถือว่าดูแล้ว จดไว้ก่อนกรอกลับต้นคลิป
        const id = itemsRef.current[i]?.v.v;
        if (id && el.currentTime >= Math.min(SEEN_SEC, (el.duration || SEEN_SEC) * 0.6)) {
          seen.current.add(id);
          const keep = [...seen.current].slice(-SEEN_MAX);
          seen.current = new Set(keep);
          try { localStorage.setItem(SEEN_KEY, JSON.stringify(keep)); } catch { /* เต็ม ข้ามไป */ }
        }
        if (!el.paused) el.pause();
        if (el.currentTime) el.currentTime = 0;
      }
    }
    const el = players.current.get(active);
    if (!el) return;
    setReady(el.readyState >= 3);
    el.muted = muted;
    const tryPlay = () => {
      if (!el.paused) return;              // เล่นอยู่แล้ว ไม่ต้องสั่งซ้ำ
      el.play().catch(() => {
        if (el.muted) return;   // ปฏิเสธทั้งที่เงียบอยู่ — เดี๋ยว canplay ข้างล่างสั่งซ้ำให้
        // เบราว์เซอร์ห้ามเล่นพร้อมเสียงถ้าลูกค้ายังไม่เคยแตะจอ
        // เล่นแบบเงียบไปก่อน แล้วขึ้นป้ายชวนให้แตะเปิดเสียง
        el.muted = true;
        setMute(true, false);
        setAskSound(true);
        el.play().catch(() => {});
      });
    };
    tryPlay();
    // ⚠️ iOS: play() ที่สั่งตอน readyState=0 ถูกยกเลิกกลางทางได้ (เช่นชนกับ load()
    //    ที่เพิ่งสั่งตอนป้อน src) แล้วจะไม่มีใครสั่งซ้ำ — เฟรมแรกขึ้นแต่คลิปนิ่งค้าง
    //    ต้องดักตอนคลิปพร้อมแล้วเช็คว่ายังหยุดอยู่ไหม ถ้าหยุดให้สั่งเล่นซ้ำ
    const kick = () => { if (el.paused) tryPlay(); };
    el.addEventListener("canplay", kick);
    el.addEventListener("loadeddata", kick);
    return () => {
      el.removeEventListener("canplay", kick);
      el.removeEventListener("loadeddata", kick);
    };
  }, [active, muted, setMute]);

  // แตะตรงไหนก็ได้ในฟีดครั้งแรก = เปิดเสียงให้เลย แบบเดียวกับ TikTok บนเว็บ
  // ใช้ capture แต่ไม่ขวางอะไร ปุ่มซื้อ/ลิงก์ยังกดได้ตามปกติ
  useEffect(() => {
    if (!askSound) return;
    const on = () => {
      justUnmuted.current = true;
      setMute(false);
      setAskSound(false);
      // ⚠️ ต้องสั่งเล่นตรงนี้ทันที ไม่ใช่รอ effect หลัง state เปลี่ยน
      //    iOS โหมดประหยัดแบตห้าม autoplay ทุกกรณี (ปิดเสียงก็ห้าม)
      //    คำสั่งเล่นจะผ่านก็ต่อเมื่ออยู่ "ในจังหวะแตะ" เท่านั้น — effect อยู่นอกจังหวะแล้ว
      const el = players.current.get(activeRef.current);
      if (el) {
        el.muted = false;
        el.play().catch(() => {});
      }
    };
    // ฟังทั้งหน้า ไม่ใช่แค่ในกรอบฟีด — แตะปุ่มไหนก่อนก็ได้เสียงเลย
    document.addEventListener("pointerdown", on, { once: true, capture: true });
    return () => document.removeEventListener("pointerdown", on, true);
  }, [askSound, setMute]);

  const tap = useCallback((el: HTMLVideoElement) => {
    // แตะครั้งแรกคือการเปิดเสียง อย่าให้คลิปหยุดไปด้วย — แต่ถ้ามันยังไม่เล่น
    // (โหมดประหยัดแบตกัน autoplay ไว้) ให้ใช้จังหวะแตะนี้สั่งเล่นเลย
    if (justUnmuted.current) {
      justUnmuted.current = false;
      if (el.paused) el.play().catch(() => {});
      return;
    }
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  return (
    <main
      ref={rootRef}
      className="no-scrollbar h-[calc(100dvh-57px-env(safe-area-inset-bottom))] snap-y snap-mandatory overflow-y-auto bg-black"
    >
      {/* ต่อกับที่เก็บคลิปไว้ล่วงหน้าตั้งแต่เปิดหน้า — ประหยัดเวลา DNS + TLS
          ก่อนขอไฟล์แรก ซึ่งบนมือถือกินเวลาหลายร้อยมิลลิวินาที */}
      {VIDEO_HOST && (
        <>
          <link rel="preconnect" href={VIDEO_HOST} crossOrigin="anonymous" />
          <link rel="dns-prefetch" href={VIDEO_HOST} />
        </>
      )}
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
            mode={mode}
            live={i === active}
            busy={i === active && !ready}
            liked={liked.has(item.v.v)}
            saved={saved.has(item.v.v)}
            likes={counts[item.v.v]?.[0] ?? 0}
            comments={counts[item.v.v]?.[1] ?? 0}
            onLike={bumpLike}
            onSave={markSaved}
            onOpenComments={setCommentFor}
            onToast={say}
            // ใบที่ดูอยู่โหลดเต็มที่ · ใบถัดไปรอให้ใบนี้เล่นได้ก่อนค่อยโหลดตาม
            // ไม่งั้นเปิดหน้ามาแย่งเน็ตกันสามคลิป ใบแรกกว่าจะเล่นได้นาน
            eager={i === active || (i === active + 1 && ready)}
            register={register}
            onTap={tap}
            onReady={setReady}
          />
        );
      })}

      {/* ป้ายชวนแตะเปิดเสียง — เบราว์เซอร์ห้ามเล่นพร้อมเสียงถ้ายังไม่เคยแตะจอ */}
      {askSound && (
        <span className="pointer-events-none fixed left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[13px] font-medium backdrop-blur"
              style={{ top: "calc(env(safe-area-inset-top) + 4rem)" }}>
          🔇 แตะที่จอเพื่อเปิดเสียง
        </span>
      )}

      {toast && (
        <span className="pointer-events-none fixed left-1/2 top-1/2 z-[80] -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2.5 text-[13px] backdrop-blur">
          {toast}
        </span>
      )}

      {commentFor && (
        <VideoComments
          id={commentFor}
          open
          onClose={() => setCommentFor(null)}
          onCount={(n) =>
            setCounts((cur) => ({ ...cur, [commentFor]: [cur[commentFor]?.[0] ?? 0, n] }))
          }
        />
      )}
    </main>
  );
}

type Mode = "video" | "poster" | "blank";

// แยกเป็นคอมโพเนนต์ที่จำค่าไว้ — เลื่อนทีนึงจะได้วาดใหม่แค่ไม่กี่ใบ
// ไม่งั้นเลื่อนทุกครั้งต้องวาดใหม่ทั้ง 459 ใบ ฟีดจะกระตุก
const Slide = memo(function Slide({
  item: { v, p },
  i,
  mode,
  live,
  busy,
  eager,
  liked,
  saved,
  likes,
  comments,
  onLike,
  onSave,
  onOpenComments,
  onToast,
  register,
  onTap,
  onReady,
}: {
  item: FeedItem;
  i: number;
  mode: Mode;
  live: boolean;
  busy: boolean;
  eager: boolean;
  liked: boolean;
  saved: boolean;
  likes: number;
  comments: number;
  onLike: (id: string, on: boolean) => void;
  onSave: (id: string, on: boolean) => void;
  onOpenComments: (id: string) => void;
  onToast: (msg: string) => void;
  register: (i: number, el: HTMLVideoElement | null) => void;
  onTap: (el: HTMLVideoElement) => void;
  onReady: (b: boolean) => void;
}) {
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const src = videoSrc(v);

  // ⚠️ ref ต้องเป็นฟังก์ชัน "ตัวเดิม" ทุกรอบ
  //    เขียน ref={(node)=>...} ตรง ๆ = สร้างฟังก์ชันใหม่ทุก render
  //    React จะถอด ref (เรียกด้วย null) แล้วใส่ใหม่ทุกครั้งที่ re-render
  //    → setEl(null) → re-render → ใส่ใหม่ → วนกันเอง
  //    ผลคือ <video> ถูก reset รัว ๆ (event emptied) และ play() ถูกยกเลิก
  //    กลางทางตลอด (AbortError) — คลิปจึงค้างไม่เล่นบนมือถือ
  const setNode = useCallback((node: HTMLVideoElement | null) => {
    setEl(node);
    register(i, node);
  }, [i, register]);
  // ต่อ HLS เฉพาะใบที่กำลังดู กับใบถัดไปที่พร้อมโหลดแล้วเท่านั้น (ดู eager)
  // ไม่งั้นหลายใบโหลดพร้อมกันจนแย่งเน็ตกันเอง คลิปที่ดูอยู่จะค้าง
  useHls(el, src, eager);

  // ฝั่ง Safari (เล่น HLS เองในตัว): ป้อน/ถอด src ด้วย JS ตาม eager
  // - ใส่เฉพาะใบที่ดูอยู่กับใบถัดไป ไม่งั้นหลายตัวเล่นแย่งเน็ตกันจนค้าง
  // - พอเลิกเป็นใบที่ดูอยู่ ต้อง pause + ถอด src + load() — ถอดเฉย ๆ ไม่พอ
  //   เบราว์เซอร์ยังดึงข้อมูลที่ค้างท่ออยู่ต่อ
  useEffect(() => {
    if (!el) return;
    if (!(isSafariHls() || !usingHls)) return;   // ทาง hls.js มี useHls จัดการอยู่แล้ว
    // ป้อน src "ครั้งเดียว" ตอนใบนี้โผล่มาในโหมดวิดีโอ แล้วไม่แตะอีกเลย
    //
    // ⚠️ ห้ามถอด src ออกตอนเลื่อนผ่าน แล้วใส่กลับตอนเลื่อนมาถึง
    //    การถอด src + load() = สั่งล้างตัวเล่นใหม่ ซึ่งจะไปยกเลิก play() ที่ค้างท่ออยู่
    //    (AbortError) และตอนเลื่อนถึงใบใหม่ก็ต้องเริ่มโหลดจากศูนย์ ทำให้ค้าง
    //    อาการที่เคยเจอ: เลื่อนไปใบ 2 แล้วได้ยินเสียงใบ 1 ต่อ ส่วนใบ 2 ค้างไม่เล่น
    //    การหยุดคลิปที่ไม่ได้ดูใช้ pause() พอ ไม่ต้องล้างตัวเล่น
    if (!el.getAttribute("src")) {
      el.src = src;
      el.load();
    }
  }, [el, src]);

  const poster = mode === "blank" ? undefined : videoPoster(v, 480);
  // คลิปแนวตั้งขยายเต็มจอแบบ TikTok · คลิปจัตุรัส/แนวนอนย่อให้เห็นครบ ไม่ตัดหัวตัดท้าย
  const fit = v.vw / v.vh < 0.85 ? "object-cover" : "object-contain";

  return (
    <section data-i={i} className="relative h-full w-full snap-start [scroll-snap-stop:always]">
      {mode === "video" ? (
        <video
          ref={setNode}
          // ⚠️ ห้ามใส่ src ใน JSX เด็ดขาด — ทั้งสองทางป้อนวิดีโอด้วย JS ใน effect
          //    หน้านี้ถูก build เป็น HTML ล่วงหน้า ตอน build ไม่มีเบราว์เซอร์
          //    isSafariHls() จึงเป็น false เสมอ → HTML ไม่มี src
          //    แล้ว React "ไม่แก้ attribute ที่ไม่ตรงกันตอน hydrate" — iPhone จึงได้
          //    <video> ไร้ src ตลอดกาล: โปสเตอร์ขึ้น วงหมุนค้าง แตะไม่ติด
          //    (คอมไม่เป็นเพราะทาง hls.js ป้อนผ่าน JS อยู่แล้ว ไม่พึ่ง attribute)
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

      {/* ปุ่มขวาแบบ TikTok — ใส่เฉพาะใบที่อยู่ใกล้ ๆ ใบที่ดูอยู่ ไม่ต้องมีครบทุกใบ */}
      {mode === "video" && (
        <VideoActions
          id={v.v}
          liked={liked}
          likes={likes}
          comments={comments}
          saved={saved}
          productHref={p ? `/products/${encodeURIComponent(p.h)}/` : undefined}
          onLike={(on) => onLike(v.v, on)}
          onSave={(on) => onSave(v.v, on)}
          onComment={() => onOpenComments(v.v)}
          onToast={onToast}
        />
      )}

      {/* ป้ายชื่อคลิป + ลิงก์สินค้า overlay ด้านล่าง — เว้นขวาไว้ให้แถบปุ่ม */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pr-16 pt-14">
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

      {/* ความยาวคลิป — อยู่ซ้าย ไม่ให้ชนปุ่มเสียงที่ลอยอยู่มุมขวา
          ⚠️ ห้ามใส่ "ใบที่เท่าไหร่ / ทั้งหมดกี่ใบ" — ไม่ต้องให้คนนอกรู้ว่าร้านมีคลิปกี่ใบ */}
      <span
        className="absolute left-3 rounded-full bg-black/50 px-2 py-0.5 text-xs tabular-nums"
        style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        {durLabel(v.dur)}
      </span>
    </section>
  );
});
