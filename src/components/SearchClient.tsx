"use client";

// หน้าค้นหา — โหลดดัชนีครั้งเดียว แล้วค้นในเครื่อง ผลขึ้นทันทีทุกตัวอักษรที่พิมพ์
// รองรับ: รหัสอะไหล่ (00627), รุ่นเครื่อง (5200, MS180), ชื่อไทย (สปริง คาร์บู), SKU ตัวเลือก (00894-22T)
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Stars from "./Stars";
import { compactCount, formatPrice } from "@/lib/types";

interface Entry {
  h: string; t: string; k: string; p: number; m: number; s: number; n: number;
  c?: number; i?: string; r?: [number, number]; vk?: string;
  // เตรียมไว้ล่วงหน้าตอนโหลด — ค้นเร็วขึ้นมาก
  lt?: string; lk?: string; lvk?: string;
}

const PAGE = 40;
const POPULAR = ["โซ่", "บาร์", "ตะไบ", "หัวเทียน", "สปริง", "ลูกสูบ", "คาร์บูเรเตอร์", "5200", "7800", "9800", "MS180", "KINGKONG"];

export default function SearchClient() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ base?: string; items: Entry[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const inputRef = useRef<HTMLInputElement>(null);

  // อ่านคำค้นจาก ?q= (ลิงก์แชร์ได้) + โฟกัสช่องพิมพ์ทันที
  useEffect(() => {
    const init = new URLSearchParams(window.location.search).get("q");
    if (init) setQ(init);
    inputRef.current?.focus();
  }, []);

  // โหลดดัชนีครั้งเดียว
  useEffect(() => {
    let alive = true;
    fetch("/search-index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (!alive) return;
        for (const e of d.items as Entry[]) {
          e.lt = e.t.toLowerCase();
          e.lk = e.k.toLowerCase();
          if (e.vk) e.lvk = e.vk.toLowerCase();
        }
        setData(d);
      })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  // จำคำค้นไว้ใน URL (กด back กลับมาแล้วคำค้นยังอยู่)
  useEffect(() => {
    const u = new URL(window.location.href);
    if (q) u.searchParams.set("q", q); else u.searchParams.delete("q");
    window.history.replaceState(null, "", u);
    setShown(PAGE);
  }, [q]);

  const results = useMemo(() => {
    if (!data) return [];
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const out: { e: Entry; sc: number }[] = [];
    for (const e of data.items) {
      let sc = 0;
      let ok = true;
      for (const w of tokens) {
        let t = 0;
        if (e.lk === w) t = 1000;                               // SKU ตรงเป๊ะ
        else if (e.lk!.startsWith(w)) t = 400;                  // SKU ขึ้นต้น
        else if (e.lvk && e.lvk.includes(w)) t = 300;           // SKU ของตัวเลือก
        else if (e.lt!.startsWith(w)) t = 150;                  // ชื่อขึ้นต้น
        else if (e.lt!.includes(" " + w)) t = 120;              // ต้นคำในชื่อ
        else if (e.lt!.includes(w)) t = 80;                     // อยู่ในชื่อ
        if (!t) { ok = false; break; }
        sc += t;
      }
      if (!ok) continue;
      if (e.s > 0) sc += 30;                                    // มีของ ขึ้นก่อน
      if (e.i) sc += 20;                                        // มีรูป ขึ้นก่อน
      if (e.r) sc += Math.min(e.r[1], 500) / 10;                // รีวิวเยอะ ขึ้นก่อน
      out.push({ e, sc });
    }
    out.sort((a, b) => b.sc - a.sc);
    return out.map((x) => x.e);
  }, [data, q]);

  // e.i เป็นได้ 3 แบบ: "/img/xxx" (เก็บมาไว้เองแล้ว) · "http..." (เต็ม ๆ) ·
  // หรือชื่อไฟล์เปล่า ๆ ที่ต้องเติม base ข้างหน้า (สินค้าใหม่ที่ยังไม่ได้เก็บรูป)
  const img = (e: Entry) => {
    if (!e.i) return null;
    if (e.i.startsWith("/") || e.i.startsWith("http")) return e.i;
    return data?.base ? data.base + e.i : null;
  };

  return (
    <main className="pb-20">
      {/* หัวค้นหา — ช่องพิมพ์จริง */}
      <header className="sticky top-0 z-40 bg-safety px-3 pb-2 pt-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Link href="/" aria-label="กลับหน้าแรก" className="shrink-0 px-1 text-xl text-white">‹</Link>
          <div className="flex flex-1 items-center gap-2 rounded-sm bg-white px-2.5 py-1.5">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-[#757575] stroke-2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(ev) => setQ(ev.target.value)}
              placeholder="ค้นหาเลื่อยยนต์ โซ่ อะไหล่ รหัสสินค้า..."
              className="w-full bg-transparent text-[13px] text-[#222] outline-none placeholder:text-[#9a9a9a]"
            />
            {q && (
              <button onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="ล้าง"
                className="shrink-0 text-base leading-none text-[#9a9a9a]">×</button>
            )}
          </div>
        </div>
      </header>

      {/* ยังไม่พิมพ์ → คำยอดฮิต */}
      {!q.trim() && (
        <section className="px-3 py-4">
          <p className="mb-2 text-xs text-steel-300">คำค้นยอดนิยม</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR.map((w) => (
              <button key={w} onClick={() => setQ(w)}
                className="rounded-full border border-steel-600 px-3 py-1.5 text-[13px] text-[#333]">
                {w}
              </button>
            ))}
          </div>
        </section>
      )}

      {failed && (
        <p className="px-3 py-10 text-center text-sm text-steel-300">โหลดดัชนีค้นหาไม่สำเร็จ ลองรีเฟรช</p>
      )}
      {q.trim() && !data && !failed && (
        <p className="px-3 py-10 text-center text-sm text-steel-300">กำลังเตรียมค้นหา…</p>
      )}

      {q.trim() && data && (
        <section className="px-3 py-3">
          <p className="mb-2 text-xs text-steel-300">
            พบ {results.length.toLocaleString("th-TH")} รายการ
          </p>

          {results.length === 0 && (
            <div className="py-8 text-center text-sm text-steel-300">
              <p>ไม่พบ &ldquo;{q}&rdquo;</p>
              <p className="mt-1 text-xs">ลองพิมพ์สั้นลง เช่น รหัส 5 หลัก หรือชื่ออะไหล่</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {results.slice(0, shown).map((e) => (
              <Link key={e.h} href={`/products/${encodeURIComponent(e.h)}`}
                className="overflow-hidden rounded-sm border border-steel-700 bg-white">
                <div className="relative aspect-square bg-white">
                  {img(e) ? (
                    <Image src={img(e)!} alt={e.t} fill sizes="(max-width: 512px) 50vw, 256px" className="object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-steel-600">ไม่มีรูป</div>
                  )}
                  {e.s <= 0 && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white">สินค้าหมด</span>
                  )}
                  {e.n > 1 && (
                    <span className="absolute bottom-0 left-0 rounded-tr bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{e.n} ตัวเลือก</span>
                  )}
                </div>
                <div className="p-2">
                  <p className="clamp-2 min-h-[2.5rem] text-[13px] leading-tight text-[#333]">{e.t}</p>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="font-heading text-[15px] font-semibold text-safety">
                      {e.m > e.p ? `${formatPrice(e.p)} - ${formatPrice(e.m)}` : formatPrice(e.p)}
                    </span>
                    {e.c && <span className="text-[11px] text-steel-300 line-through">฿{e.c.toLocaleString("th-TH")}</span>}
                  </div>
                  {e.r ? (
                    <p className="mt-0.5 flex items-center gap-1 overflow-hidden whitespace-nowrap text-[11px] text-steel-300">
                      <Stars value={e.r[0]} size={11} />
                      <span>{e.r[0].toFixed(1)}</span>
                      <span className="text-steel-600">|</span>
                      <span>{compactCount(e.r[1])} รีวิว</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-steel-300">
                      {e.s > 0 ? `คงเหลือ ${e.s.toLocaleString("th-TH")}` : "สินค้าหมด"}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {shown < results.length && (
            <button onClick={() => setShown((s) => s + PAGE)}
              className="mt-3 w-full rounded-lg border border-steel-600 py-2.5 text-[13px] text-[#333]">
              โหลดเพิ่ม ({(results.length - shown).toLocaleString("th-TH")} รายการ)
            </button>
          )}
        </section>
      )}
    </main>
  );
}
