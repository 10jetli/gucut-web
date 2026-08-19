"use client";

// คนเข้าเว็บ — /admin/live/
//
// นับที่เซิร์ฟเวอร์เอง ตัวบล็อกโฆษณาบล็อกไม่ได้ จึงได้เลขจริงกว่า GA4
// (GA4 มองไม่เห็นคนที่ใช้ตัวบล็อก หรือ Safari/iOS ที่ตัดคุกกี้ — ซึ่งคือลูกค้าส่วนใหญ่ของร้าน)
//
// ค่าเริ่มต้นคือ "กดรีเฟรชเอง" ตามกฎที่เจ้าของร้านสั่งไว้ว่าหน้าหลังร้านห้ามเช็คอัตโนมัติ
// แต่หน้านี้มีสวิตช์ให้เปิดรีเฟรชเองได้ เพราะตัวเลข "ออนไลน์ตอนนี้" ไม่มีประโยชน์ถ้าไม่สด
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Channel { ch: string; n: number; label: string; kind: string }

interface Stats {
  channelsToday: Channel[];
  channelsWeek: Channel[];
  countries: { cc: string; n: number }[];
  online: number;
  onlineWindowMin: number;
  pages: { p: string; n: number }[];
  today: number;
  days: { d: string; n: number }[];
  at: number;
}

// รหัสประเทศ 2 ตัว → ธง (ใช้ regional indicator ไม่ต้องโหลดรูปธงเลย)
function flag(cc: string) {
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳️";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ชื่อประเทศภาษาไทย — เบราว์เซอร์แปลให้เอง ไม่ต้องมีตารางชื่อประเทศในโค้ด
//
// ⚠️ สร้างตอนเรียกใช้ ไม่ใช่ตอนโหลดไฟล์ — เบราว์เซอร์บางรุ่นสร้างแล้ว throw
//    ถ้าไปสร้างไว้ระดับไฟล์ ทั้งหน้าจะพังเป็น "Application error" ทันที
//    (เคยพลาดมาแล้ว 17 ส.ค. 2569 — หน้าคนเข้าเว็บพังบ้างไม่พังบ้างบน Safari)
let names: Intl.DisplayNames | null | undefined;
function countryName(cc: string) {
  if (cc === "ZZ") return "ไม่ทราบประเทศ";
  if (names === undefined) {
    try {
      names = typeof Intl !== "undefined" && "DisplayNames" in Intl
        ? new Intl.DisplayNames(["th"], { type: "region" })
        : null;
    } catch { names = null; }
  }
  try { return names?.of(cc) || cc; } catch { return cc; }
}

// ไอคอนประจำกลุ่มช่องทาง — ไม่ต้องโหลดรูปเลยสักไบต์
const KIND_ICON: Record<string, string> = {
  ai: "🤖", search: "🔍", ads: "💰", social: "💬", market: "🛒", direct: "⌨️", other: "🔗",
};

// path ที่มี % แปลก ๆ จะทำให้ decodeURIComponent โยน error จนทั้งหน้าพัง
function safePath(p: string) {
  try { return decodeURIComponent(p); } catch { return p; }
}

export default function AdminLive() {
  const [key, setKey] = useState("");
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [span, setSpan] = useState<"today" | "week">("today");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async (k: string) => {
    if (!k) return;
    setBusy(true);
    try {
      const r = await adminFetch("/api/live", k);
      if (!r.ok) { setErr("รหัสหลังร้านไม่ถูกต้อง"); return; }
      const j = await r.json();
      // เซิร์ฟเวอร์รุ่นเก่ายังไม่ส่ง countries มา — เติมค่าว่างกันหน้าพัง
      setS({
        online: Number(j?.online) || 0,
        onlineWindowMin: Number(j?.onlineWindowMin) || 5,
        pages: Array.isArray(j?.pages) ? j.pages : [],
        countries: Array.isArray(j?.countries) ? j.countries : [],
        // เซิร์ฟเวอร์รุ่นเก่ายังไม่ส่งช่องทางมา — เติมค่าว่างกันหน้าพังตอน deploy ทับกัน
        channelsToday: Array.isArray(j?.channelsToday) ? j.channelsToday : [],
        channelsWeek: Array.isArray(j?.channelsWeek) ? j.channelsWeek : [],
        today: Number(j?.today) || 0,
        days: Array.isArray(j?.days) ? j.days : [],
        at: Number(j?.at) || Date.now(),
      });
      setErr("");
    } catch {
      setErr("ดึงข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(key); }, [key, load]);

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!auto || !key) return;
    timer.current = setInterval(() => { void load(key); }, 15000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, key, load]);

  const max = Math.max(1, ...(s?.days || []).map((d) => d.n));
  const thaiDay = (iso: string) => {
    try {
      return new Date(iso + "T00:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
    } catch { return iso.slice(5); }
  };

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="flex-1 text-[15px] font-semibold text-white">คนเข้าเว็บ</span>
        <button
          onClick={() => void load(key)}
          disabled={busy}
          className="rounded-sm border border-white/30 px-2.5 py-1 text-[12px] text-white disabled:opacity-40"
        >
          {busy ? "..." : "รีเฟรช"}
        </button>
      </header>

      <div className="mx-auto max-w-lg p-3">
        {err && <p className="mb-3 rounded-sm bg-safety-tint px-3 py-2 text-[13px] text-safety">{err}</p>}

        <section className="mb-3 rounded-sm bg-white p-4 text-center">
          <p className="text-[12px] text-ink-300">ออนไลน์ตอนนี้</p>
          <p className="mt-1 text-[44px] font-extrabold leading-none text-safety">
            {s ? s.online.toLocaleString("th-TH") : "—"}
          </p>
          <p className="mt-1.5 text-[11.5px] text-ink-300">
            นับคนที่มีความเคลื่อนไหวใน {s?.onlineWindowMin ?? 5} นาทีล่าสุด
          </p>
          <label className="mt-3 inline-flex items-center gap-2 text-[12px] text-ink-700">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[#ff3c00]" />
            รีเฟรชเองทุก 15 วินาที
          </label>
        </section>

        <section className="mb-3 rounded-sm bg-white p-4">
          <p className="mb-2 text-[14px] font-bold text-ink">กำลังดูหน้าไหนอยู่</p>
          {!s || s.pages.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-ink-300">ยังไม่มีใครออนไลน์</p>
          ) : (
            <ul className="space-y-1.5">
              {s.pages.map((p) => (
                <li key={p.p} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-ink-700">{safePath(p.p)}</span>
                  <span className="shrink-0 font-semibold text-ink">{p.n}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-3 rounded-sm bg-white p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[14px] font-bold text-ink">มาจากช่องทางไหน</p>
            <div className="flex overflow-hidden rounded-sm border border-steel-700 text-[11.5px]">
              {(["today", "week"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSpan(v)}
                  className={`px-2.5 py-1 ${span === v ? "bg-ink text-white" : "bg-white text-ink-300"}`}
                >
                  {v === "today" ? "วันนี้" : "7 วัน"}
                </button>
              ))}
            </div>
          </div>
          <ChannelList rows={(span === "today" ? s?.channelsToday : s?.channelsWeek) || []} />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-300">
            นับจากต้นทางตอน<b>เปิดหน้าแรก</b>ของการเข้าเว็บแต่ละรอบ · เก็บแค่ชื่อเว็บที่ส่งมา
            ไม่ได้เก็บลิงก์เต็มของลูกค้า · <b>เข้าตรง</b> คือพิมพ์เอง บุ๊กมาร์ก หรือกดจากแอปแชท
            ที่ไม่บอกต้นทาง
          </p>
        </section>

        <section className="mb-3 rounded-sm bg-white p-4">
          <p className="mb-2 text-[14px] font-bold text-ink">มาจากประเทศไหน (วันนี้)</p>
          {!s || !s.countries?.length ? (
            <p className="py-4 text-center text-[13px] text-ink-300">ยังไม่มีข้อมูลวันนี้</p>
          ) : (
            <ul className="space-y-1.5">
              {s.countries.map((c) => {
                const total = s.countries.reduce((a, b) => a + b.n, 0) || 1;
                return (
                  <li key={c.cc} className="flex items-center gap-2.5 text-[13px]">
                    <span className="w-9 shrink-0 text-[15px]">{flag(c.cc)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-700">{countryName(c.cc)}</span>
                    <span className="w-20 shrink-0">
                      <span className="block h-1.5 rounded-full bg-steel-700">
                        <span className="block h-1.5 rounded-full bg-safety" style={{ width: `${Math.max(6, (c.n / total) * 100)}%` }} />
                      </span>
                    </span>
                    <span className="w-10 shrink-0 text-right font-semibold text-ink">{c.n.toLocaleString("th-TH")}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-sm bg-white p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[14px] font-bold text-ink">ผู้เข้าชม 7 วันล่าสุด</p>
            <p className="text-[12px] text-ink-300">วันนี้ <b className="text-ink">{s ? s.today.toLocaleString("th-TH") : "—"}</b> คน</p>
          </div>
          {!s ? (
            <p className="py-6 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
          ) : (
            <div className="flex h-28 items-end gap-1.5">
              {s.days.map((d) => (
                <div key={d.d} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-ink-300">{d.n}</span>
                  <div
                    className="w-full rounded-t-sm bg-safety"
                    style={{ height: `${Math.max(3, (d.n / max) * 76)}px` }}
                  />
                  <span className="text-[9.5px] text-ink-300">{thaiDay(d.d)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-300">
            นับเป็น <b>จำนวนคน</b> ไม่ใช่จำนวนครั้งที่เปิดหน้า · คนเดิมเข้าหลายรอบในวันเดียวนับเป็น 1 ·
            เก็บย้อนหลัง 30 วัน · <b>ไม่ได้นับตัวเองตอนเข้าหลังร้าน</b> ·
            <b>ไม่นับบอต</b> (Googlebot · บอต AI · ตัวดูดข้อมูล) — ดูตัวเลขบอตแยกได้ที่หน้าตรวจสุขภาพ SEO
          </p>
        </section>
      </div>
    </main>
  );
}

function ChannelList({ rows }: { rows: Channel[] }) {
  if (!rows.length) {
    return <p className="py-4 text-center text-[13px] text-ink-300">ยังไม่มีข้อมูลช่วงนี้</p>;
  }
  const total = rows.reduce((a, b) => a + b.n, 0) || 1;
  const ai = rows.filter((r) => r.kind === "ai").reduce((a, b) => a + b.n, 0);
  return (
    <>
      <ul className="space-y-1.5">
        {rows.slice(0, 14).map((c) => (
          <li key={c.ch} className="flex items-center gap-2.5 text-[13px]">
            <span className="w-6 shrink-0 text-center text-[14px]">{KIND_ICON[c.kind] || "🔗"}</span>
            <span className="min-w-0 flex-1 truncate text-ink-700">{c.label}</span>
            <span className="w-20 shrink-0">
              <span className="block h-1.5 rounded-full bg-steel-700">
                <span
                  className={`block h-1.5 rounded-full ${c.kind === "ai" ? "bg-[#12a150]" : "bg-safety"}`}
                  style={{ width: `${Math.max(6, (c.n / total) * 100)}%` }}
                />
              </span>
            </span>
            <span className="w-10 shrink-0 text-right font-semibold text-ink">
              {c.n.toLocaleString("th-TH")}
            </span>
            <span className="w-9 shrink-0 text-right text-[11px] text-ink-300">
              {Math.round((c.n / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
      {ai > 0 && (
        // ⚠️ บอกแค่ "มีกี่คน" ห้ามสรุปแทนเจ้าของร้านว่านี่คือผลงานของอะไร
        //    เคยเขียนไว้ว่า "คือผลของงาน llms.txt / agents.md ที่ทำไว้" (19 ส.ค. 2569)
        //    ซึ่งพิสูจน์ไม่ได้ — คนอาจกดมาจาก ChatGPT ด้วยเหตุอื่นก็ได้
        //    หน้าหลังร้านมีไว้บอกตัวเลขจริง ไม่ใช่ไว้อวดผลงานตัวเอง
        <p className="mt-2.5 rounded-sm bg-[#12a150]/10 px-3 py-2 text-[12px] leading-relaxed text-[#12a150]">
          🤖 มีคนกดลิงก์จากผู้ช่วย AI เข้ามา <b>{ai.toLocaleString("th-TH")}</b> คน
          <span className="mt-1 block text-ink-300">
            คนละเรื่องกับ &ldquo;บอต AI มาอ่านเว็บ&rdquo; ในหน้าตรวจสุขภาพ SEO —
            อันนั้นคือเครื่องมาเก็บข้อมูล อันนี้คือคนจริงที่ AI แนะนำให้มา
          </span>
        </p>
      )}
    </>
  );
}
