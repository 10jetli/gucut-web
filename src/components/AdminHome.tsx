"use client";

// หน้าเข้าระบบหลังบ้าน + หน้ารวมเมนู — /admin/
// ยังไม่ล็อกอิน → ช่องใส่รหัส   ล็อกอินแล้ว → เมนูหลังบ้าน
import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch, clearKey, getKey, saveKey, verifyKey } from "@/lib/admin";

export default function AdminHome() {
  const [key, setKey] = useState<string | null>(null);   // null = ยังอ่านจากเครื่องไม่เสร็จ
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [unread, setUnread] = useState(0);
  const [next, setNext] = useState("");

  useEffect(() => {
    setKey(getKey());
    const n = new URLSearchParams(window.location.search).get("next") || "";
    // รับเฉพาะเส้นทางในเว็บเรา กัน redirect ไปเว็บอื่น
    if (/^\/admin\/[a-z0-9/-]*$/.test(n)) setNext(n);
  }, []);

  // ล็อกอินแล้ว → ดึงจำนวนข้อความที่ยังไม่ได้อ่านมาโชว์บนปุ่มแชท
  useEffect(() => {
    if (!key) return;
    let live = true;
    const tick = async () => {
      try {
        const r = await adminFetch("/api/chat", key);
        if (r.status === 401) { clearKey(); setKey(""); setErr("รหัสถูกเปลี่ยนแล้ว — ใส่รหัสใหม่อีกครั้ง"); return; }
        const d = await r.json();
        if (live) setUnread((d.rooms || []).reduce((a: number, x: { unread: number }) => a + x.unread, 0));
      } catch { /* เน็ตสะดุด รอบหน้าค่อยลองใหม่ */ }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => { live = false; clearInterval(t); };
  }, [key]);

  async function login() {
    const k = input.trim();
    if (!k || busy) return;
    setBusy(true); setErr("");
    const res = await verifyKey(k);
    setBusy(false);
    if (res === "wrong") { setErr("รหัสไม่ถูกต้อง"); return; }
    if (res === "offline") { setErr("ต่อกับเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง"); return; }
    saveKey(k);
    if (next) { window.location.replace(next); return; }
    setInput("");
    setKey(k);
  }

  if (key === null) return <main className="min-h-[100dvh] bg-steel-900" />;

  // ---------- ยังไม่ล็อกอิน ----------
  if (!key) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center bg-steel-900 px-5 pt-[18vh]">
        <div className="w-full max-w-xs">
          <p className="mb-1 text-center font-heading text-[26px] font-extrabold italic leading-none tracking-tight">
            <span className="text-safety">GU</span><span className="text-ink">CUT</span>
          </p>
          <p className="mb-7 text-center text-[12px] tracking-wide text-ink-500">ระบบหลังร้าน</p>

          <form onSubmit={(e) => { e.preventDefault(); login(); }}>
            <label htmlFor="k" className="mb-1.5 block text-[13px] font-medium text-ink-700">รหัสร้าน</label>
            <input
              id="k"
              name="password"
              type="password"
              autoComplete="current-password"
              value={input}
              onChange={(e) => { setInput(e.target.value); setErr(""); }}
              placeholder="••••••••••••"
              className="w-full rounded-sm border border-steel-600 bg-white px-3 py-3 text-[15px] tracking-widest outline-none focus:border-safety"
            />
            {err && <p className="mt-2 text-[13px] font-medium text-safety">{err}</p>}

            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="mt-4 w-full rounded-sm bg-safety py-3 font-heading text-[15px] font-semibold text-white disabled:bg-steel-600 disabled:text-ink-300"
            >
              {busy ? "กำลังตรวจรหัส..." : "เข้าสู่ระบบ"}
            </button>
          </form>

          <p className="mt-5 text-center text-[12px] leading-relaxed text-ink-300">
            ใส่ครั้งเดียว เครื่องนี้จำให้เลย
            <br />
            ลืมรหัส? ดูที่ Netlify → Environment variables → CHAT_ADMIN_KEY
          </p>
          <Link href="/" className="mt-6 block text-center text-[13px] text-ink-500 underline">
            กลับหน้าร้าน
          </Link>
        </div>
      </main>
    );
  }

  // ---------- ล็อกอินแล้ว ----------
  const menu = [
    { href: "/admin/chat/", title: "แชทลูกค้า", note: "อ่าน / ตอบข้อความจากหน้าเว็บ", badge: unread, icon: "chat" as const },
  ];

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-4 py-3.5">
        <span className="font-heading text-[16px] font-extrabold italic leading-none">
          <span className="text-safety">GU</span><span className="text-[#c9cacc]">CUT</span>
        </span>
        <span className="text-[14px] font-semibold text-white">ระบบหลังร้าน</span>
        <button
          onClick={() => { clearKey(); setKey(""); }}
          className="ml-auto rounded-sm border border-white/25 px-2.5 py-1 text-[12px] text-white/80"
        >
          ออกจากระบบ
        </button>
      </header>

      <div className="mx-auto max-w-lg p-3">
        <ul className="overflow-hidden rounded-sm bg-white">
          {menu.map((m) => (
            <li key={m.href} className="border-b border-steel-700 last:border-0">
              <Link href={m.href} className="flex items-center gap-3 px-3.5 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-safety-tint">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-safety stroke-[1.7]">
                    <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.5A8 8 0 1121 12z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{m.title}</span>
                    {m.badge > 0 && (
                      <span className="rounded-full bg-safety px-1.5 text-[11px] font-bold text-white">{m.badge}</span>
                    )}
                  </span>
                  <span className="block text-[12px] text-ink-500">{m.note}</span>
                </span>
                <span className="shrink-0 text-[18px] text-ink-300">›</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-3 px-1 text-[12px] text-ink-300">เมนูอื่น ๆ (ออเดอร์ / สินค้า) จะทยอยเพิ่มให้</p>

        <Link href="/" className="mt-6 block text-center text-[13px] text-ink-500 underline">
          กลับหน้าร้าน
        </Link>
      </div>
    </main>
  );
}
