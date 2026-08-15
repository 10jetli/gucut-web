"use client";

// ผูกสินค้าเข้ากับคลิป — /admin/clip-shop/
//
// คลิปในฟีดตอนนี้เกือบทั้งหมดไม่มีสินค้าผูกอยู่ (ของเดิมที่ Shopify ผูกให้เป็นรูป
// อะไหล่นิ่ง ๆ ซึ่งถูกคัดออกจากฟีดไปแล้ว) หน้านี้ให้ร้านดูคลิปแล้วเลือกสินค้าเอง
// ผูกปุ๊บขึ้นหน้าเว็บทันที ไม่ต้องรอ deploy
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";
import { videoPoster, type FeedItem } from "@/lib/videos";

interface Pick { h: string; t: string; p: number; img: string | null }
interface IndexItem { h: string; t: string; p: number; i?: string }

export default function AdminClipShop() {
  const [key, setKey] = useState("");
  const [clips, setClips] = useState<FeedItem[]>([]);
  const [map, setMap] = useState<Record<string, Pick>>({});
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [openFor, setOpenFor] = useState<string | null>(null);   // คลิปที่กำลังเลือกสินค้าให้
  const [q, setQ] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => setKey(requireKey()), []);

  useEffect(() => {
    fetch("/feed.json").then((r) => r.json()).then(setClips).catch(() => {});
    fetch("/api/clip-shop").then((r) => r.json()).then((d) => setMap(d.map ?? {})).catch(() => {});
    // ดัชนีค้นหาสินค้า 2,483 รายการ — หนักไปสำหรับหน้าร้าน แต่หลังร้านโหลดได้
    fetch("/search-index.json")
      .then((r) => r.json())
      .then((d) => setIndex(d.items ?? d))
      .catch(() => {});
  }, []);

  const shown = useMemo(
    () => (onlyEmpty ? clips.filter((c) => !c.p && !map[c.v.v]) : clips),
    [clips, map, onlyEmpty],
  );

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return index.filter((x) => x.t.toLowerCase().includes(s) || x.h.toLowerCase().includes(s)).slice(0, 20);
  }, [q, index]);

  const save = useCallback(
    async (clip: string, product: Pick | null) => {
      setMsg("");
      const r = await adminFetch("/api/clip-shop", key, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clip, product }),
      });
      if (!r.ok) { setMsg("บันทึกไม่สำเร็จ — ลองใหม่ หรือเข้าระบบใหม่อีกครั้ง"); return; }
      setMap((cur) => {
        const next = { ...cur };
        if (product) next[clip] = product;
        else delete next[clip];
        return next;
      });
      setOpenFor(null);
      setQ("");
    },
    [key],
  );

  const linked = Object.keys(map).length;

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">ผูกสินค้ากับคลิป</span>
        <span className="ml-auto text-[12px] text-white/60">ผูกแล้ว {linked} คลิป</span>
      </header>

      <div className="mx-auto max-w-lg p-3">
        <p className="mb-3 rounded-sm bg-white p-3 text-[12.5px] leading-relaxed text-ink-700">
          คลิปที่ผูกสินค้าไว้จะมีปุ่มตะกร้ากับการ์ด &ldquo;ซื้อเลย&rdquo; ขึ้นในฟีด
          กดผูกแล้วขึ้นหน้าเว็บทันที ไม่ต้องรอ deploy
        </p>

        <label className="mb-3 flex items-center gap-2 rounded-sm bg-white px-3 py-2.5 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={onlyEmpty}
            onChange={(e) => setOnlyEmpty(e.target.checked)}
            className="h-4 w-4 accent-[#ff3c00]"
          />
          เอาเฉพาะคลิปที่ยังไม่มีสินค้า ({clips.filter((c) => !c.p && !map[c.v.v]).length} คลิป)
        </label>

        {msg && <p className="mb-3 rounded-sm bg-safety-tint px-3 py-2 text-[13px] text-safety">{msg}</p>}

        <div className="grid grid-cols-2 gap-2">
          {shown.slice(0, 60).map((c) => {
            const got = map[c.v.v] ?? (c.p ? { h: c.p.h, t: c.p.t, p: c.p.p, img: c.p.img } : null);
            return (
              <div key={c.v.v} className="overflow-hidden rounded-sm bg-white">
                {/* รูปปกคลิป — กดเพื่อเปิดดูคลิปจริงในหน้าร้าน */}
                <a
                  href={`/videos/?v=${c.v.v}`}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block aspect-[9/16] bg-black"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={videoPoster(c.v, 240)} alt="" className="h-full w-full object-cover" />
                </a>

                <div className="p-2">
                  {got ? (
                    <>
                      <p className="clamp-2 text-[11.5px] leading-snug text-ink">{got.t}</p>
                      <p className="mt-0.5 text-[11px] font-bold text-safety">฿{got.p.toLocaleString("th-TH")}</p>
                      <button
                        onClick={() => save(c.v.v, null)}
                        className="mt-1.5 w-full rounded-sm border border-steel-600 py-1 text-[11.5px] text-ink-500"
                      >
                        เอาสินค้าออก
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setOpenFor(c.v.v); setQ(""); }}
                      className="w-full rounded-sm bg-safety py-1.5 text-[12px] font-semibold text-white"
                    >
                      + ผูกสินค้า
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {shown.length === 0 && (
          <p className="py-16 text-center text-[13px] text-ink-300">ผูกครบทุกคลิปแล้ว 🎉</p>
        )}
        {shown.length > 60 && (
          <p className="py-4 text-center text-[12px] text-ink-300">
            แสดง 60 คลิปแรกจาก {shown.length} — ผูกไปเรื่อย ๆ แล้วรายการจะสั้นลงเอง
          </p>
        )}
      </div>

      {/* ---------- แผ่นค้นหาสินค้า ---------- */}
      {openFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
          <button aria-label="ปิด" className="absolute inset-0 bg-black/50" onClick={() => setOpenFor(null)} />
          <div className="relative flex h-[75dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white">
            <div className="shrink-0 border-b border-steel-700 p-3">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="พิมพ์ชื่อสินค้าหรือรุ่น เช่น 7800 · โซ่ 3/8 · บาร์ 11.5"
                className="w-full rounded-sm border border-steel-700 px-3 py-2.5 text-[14px] outline-none focus:border-safety"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {q.trim().length < 2 ? (
                <p className="py-10 text-center text-[13px] text-ink-300">พิมพ์อย่างน้อย 2 ตัวอักษร</p>
              ) : results.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-ink-300">ไม่เจอสินค้าที่ตรงกับคำนี้</p>
              ) : (
                results.map((x) => (
                  <button
                    key={x.h}
                    onClick={() => save(openFor, { h: x.h, t: x.t, p: x.p, img: x.i ?? null })}
                    className="flex w-full items-center gap-2.5 border-b border-steel-700 p-2.5 text-left last:border-0"
                  >
                    {x.i && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.i} alt="" className="h-11 w-11 shrink-0 rounded object-contain" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="clamp-2 block text-[12.5px] leading-snug text-ink">{x.t}</span>
                      <span className="text-[12px] font-bold text-safety">฿{x.p.toLocaleString("th-TH")}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
