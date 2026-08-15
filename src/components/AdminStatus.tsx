"use client";

// หน้าเช็คสุขภาพระบบ — /admin/status/
// เปิดมาแล้วเห็นทันทีว่าอะไรใช้ได้ อะไรพัง ไม่ต้องไล่เดาทีละอย่าง
//
// เช็คสองฝั่ง
//   ฝั่งเซิร์ฟเวอร์ (/api/status) — ZORT · Telegram · ที่เก็บข้อมูล · คีย์ต่าง ๆ
//   ฝั่งเบราว์เซอร์ (ในไฟล์นี้)  — หน้าเว็บร้าน · ล็อกอิน · แชท · แสกนภาพ · คลิป
// ที่ต้องเช็คจากเบราว์เซอร์ด้วย เพราะบางอย่างพังเฉพาะฝั่งลูกค้า เช่นไฟล์ตัวแสกนภาพหาย
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

type State = "ok" | "slow" | "off" | "down";
interface Row { name: string; state: State; note?: string; ms: number }

const LOOK: Record<State, { label: string; cls: string; dot: string }> = {
  ok:   { label: "ระบบปกติ",     cls: "text-[#12a150]", dot: "bg-[#12a150]" },
  slow: { label: "ช้าผิดปกติ",   cls: "text-[#c47f00]", dot: "bg-[#c47f00]" },
  off:  { label: "ยังไม่เปิดใช้", cls: "text-ink-300",   dot: "bg-steel-600" },
  down: { label: "ใช้ไม่ได้",     cls: "text-safety",    dot: "bg-safety" },
};

const SLOW_MS = 2500;

// เช็คจากเบราว์เซอร์ — ยิงของจริงแล้วจับเวลา
async function probe(name: string, run: () => Promise<string | void>): Promise<Row> {
  const t0 = performance.now();
  try {
    const note = await run();
    const ms = Math.round(performance.now() - t0);
    return { name, state: ms > SLOW_MS ? "slow" : "ok", note: note || "", ms };
  } catch (e) {
    return {
      name,
      state: "down",
      note: e instanceof Error ? e.message.slice(0, 120) : "",
      ms: Math.round(performance.now() - t0),
    };
  }
}

const must = async (url: string, opt?: RequestInit) => {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(`ตอบกลับ ${r.status}`);
  return r;
};

export default function AdminStatus() {
  const [key, setKey] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async () => {
    if (!key || busy) return;
    setBusy(true);

    // ---------- ฝั่งเบราว์เซอร์ ----------
    const client = await Promise.all([
      probe("หน้าเว็บร้าน", async () => { await must("/feed.json"); }),
      probe("ระบบล็อกอินลูกค้า", async () => {
        const r = await must("/api/auth");
        const d = await r.json();
        return d.user ? "ตอนนี้มีคนล็อกอินอยู่ในเครื่องนี้" : "";
      }),
      probe("แชทกับร้าน", async () => { await must("/api/chat?cid=healthcheck"); }),
      probe("หัวใจ / คอมเมนต์ใต้คลิป", async () => { await must("/api/social"); }),
      probe("ระบบแสกนภาพหาสินค้า", async () => {
        await must("/img-vectors.bin", { method: "HEAD" });
        await must("/model/mobilenet/model.json", { method: "HEAD" });
        return "ไฟล์ตัวคิดกับลายนิ้วมือสินค้าครบ";
      }),
      probe("รูปสินค้า", async () => { await must("/search-index.json", { method: "HEAD" }); }),
    ]);

    // ---------- ฝั่งเซิร์ฟเวอร์ ----------
    let server: Row[] = [];
    try {
      const r = await adminFetch("/api/status", key);
      if (r.status === 401) throw new Error("รหัสหลังร้านใช้ไม่ได้แล้ว");
      server = (await r.json()).checks ?? [];
    } catch (e) {
      server = [{
        name: "ระบบหลังบ้าน",
        state: "down",
        note: e instanceof Error ? e.message : "ต่อไม่ได้",
        ms: 0,
      }];
    }

    setRows([...client, ...server]);
    setAt(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }));
    setBusy(false);
  }, [key, busy]);

  useEffect(() => { if (key) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);

  const bad = (rows ?? []).filter((r) => r.state === "down").length;
  const slow = (rows ?? []).filter((r) => r.state === "slow").length;

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">สถานะระบบ</span>
        <button
          onClick={load}
          disabled={busy}
          className="ml-auto rounded-sm border border-white/25 px-2.5 py-1 text-[12px] text-white/80 disabled:opacity-50"
        >
          {busy ? "กำลังเช็ค..." : "เช็คใหม่"}
        </button>
      </header>

      <div className="mx-auto max-w-lg p-3">
        {/* สรุปหัวตาราง — เหมือนป้าย "ทุกระบบปกติ" ที่เห็นในระบบอื่น */}
        <section
          className={`mb-3 rounded-sm p-4 text-center ${bad ? "bg-safety-tint" : "bg-white"}`}
        >
          <p className={`font-heading text-[17px] font-bold ${bad ? "text-safety" : "text-[#12a150]"}`}>
            {rows === null ? "กำลังเช็ค..." : bad ? `มี ${bad} ระบบใช้ไม่ได้` : slow ? `ทำงานได้ แต่ ${slow} ระบบช้าผิดปกติ` : "ทุกระบบปกติ"}
          </p>
          <p className="mt-1 text-[12px] text-ink-300">
            {rows === null ? "ยิงเช็คของจริงทีละตัว" : `เช็คของจริงเมื่อ ${at} น. · ${rows.length} ระบบ`}
          </p>
        </section>

        <section className="overflow-hidden rounded-sm bg-white">
          {(rows ?? []).map((r) => {
            const look = LOOK[r.state];
            return (
              <div key={r.name} className="flex items-center gap-3 border-b border-steel-700 px-3.5 py-3 last:border-0">
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] text-ink">{r.name}</span>
                  {r.note && <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-300">{r.note}</span>}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`block text-[13px] font-semibold ${look.cls}`}>{look.label}</span>
                  {r.ms > 0 && <span className="block text-[10.5px] tabular-nums text-ink-300">{r.ms} ms</span>}
                </span>
              </div>
            );
          })}
          {rows === null && <p className="px-3.5 py-10 text-center text-[13px] text-ink-300">กำลังเช็ค...</p>}
        </section>

        <p className="mt-3 px-1 text-[11.5px] leading-relaxed text-ink-300">
          &ldquo;ยังไม่เปิดใช้&rdquo; = ยังไม่ได้ตั้งค่าไว้ ไม่ใช่ของเสีย เช่นยังไม่ได้ใส่คีย์ LINE
          หรือยังไม่ได้ใส่เบอร์พร้อมเพย์ — ใส่ได้ที่ Netlify → Environment variables
        </p>
      </div>
    </main>
  );
}
