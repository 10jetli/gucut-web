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
  const [newOrders, setNewOrders] = useState(0);
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
        // นับออเดอร์ใหม่มาโชว์บนปุ่มออเดอร์ด้วย (คำขอเบา ๆ ตอบแค่ตัวเลข)
        const ro = await adminFetch("/api/orders?stat=1", key);
        if (ro.ok) {
          const od = await ro.json();
          if (live) setNewOrders(od.newCount || 0);
        }
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
    { href: "/admin/orders/", title: "ออเดอร์", note: "รายการสั่งซื้อจากหน้าเว็บ", badge: newOrders, icon: "order" as const },
    { href: "/admin/chat/", title: "แชทลูกค้า", note: "อ่าน / ตอบข้อความจากหน้าเว็บ", badge: unread, icon: "chat" as const },
    { href: "/admin/videos/", title: "เลือกคลิป", note: "เลือกว่าคลิปไหนขึ้นหน้าวิดีโอ", badge: 0, icon: "video" as const },
    { href: "/admin/comments/", title: "คอมเมนต์ใต้คลิป", note: "อ่าน / ลบคอมเมนต์ที่ไม่เหมาะสม", badge: 0, icon: "chat" as const },
    { href: "/admin/coupons/", title: "โค้ดส่วนลด", note: "สร้างโค้ดให้ลูกค้ากดเก็บแบบ Shopee", badge: 0, icon: "tag" as const },
    { href: "/admin/points/", title: "แต้มสะสม", note: "ตั้งกติกาแต้ม · ปรับแต้มให้ลูกค้า", badge: 0, icon: "star" as const },
    { href: "/admin/clip-shop/", title: "ผูกสินค้ากับคลิป", note: "ให้คลิปในฟีดกดซื้อได้", badge: 0, icon: "order" as const },
    { href: "/admin/seo/", title: "ตรวจสุขภาพ SEO GEO AEO", note: "งานที่ควรแก้ · บอต AI มาเก็บข้อมูลหรือยัง", badge: 0, icon: "search" as const },
    { href: "/admin/marketing/", title: "พิกเซลการตลาด", note: "ใส่รหัส Meta · TikTok · Google · LINE", badge: 0, icon: "tag" as const },
    { href: "/admin/ads/", title: "ค่าโฆษณา vs ยอดขาย", note: "จ่ายโฆษณาไปเท่าไหร่ ได้กลับมาเท่าไหร่", badge: 0, icon: "tag" as const },
    { href: "/admin/clips/", title: "สถิติคลิป", note: "คลิปไหนคนดูเยอะ · ดูจนจบกี่ %", badge: 0, icon: "video" as const },
    { href: "/admin/live/", title: "คนเข้าเว็บ", note: "ออนไลน์ตอนนี้กี่คน · กำลังดูหน้าไหน", badge: 0, icon: "pulse" as const },
    { href: "/admin/status/", title: "สถานะระบบ", note: "เช็คว่าอะไรใช้ได้ อะไรพัง", badge: 0, icon: "pulse" as const },
  ];

  const ICON = {
    order: "M7 4h10l1 16H6L7 4zm2.5 4a2.5 2.5 0 005 0",
    chat: "M21 12a8 8 0 01-11.6 7.1L4 20l1-4.5A8 8 0 1121 12z",
    video: "M3.5 7.5h11a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-7a1 1 0 011-1zm12 3.5l5-3v9l-5-3z",
    pulse: "M3 12h4l2.5-6 4 12 2.5-6H21",
    tag: "M4 12.5V5a1 1 0 011-1h7.5L21 12.5 12.5 21 4 12.5zM8 8.5v.01",
    search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4",
    star: "M12 3l2.6 5.6 6.4.8-4.7 4.3 1.3 6.3L12 17l-5.6 3 1.3-6.3L3 9.4l6.4-.8L12 3z",
  };

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-4 py-3.5">
        <span className="font-heading text-[16px] font-extrabold italic leading-none">
          <span className="text-safety-light">GU</span><span className="text-[#c9cacc]">CUT</span>
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
                    <path d={ICON[m.icon]} strokeLinecap="round" strokeLinejoin="round" />
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

        <p className="mt-3 px-1 text-[12px] text-ink-300">เมนูอื่น ๆ (สินค้า / สต็อก) จะทยอยเพิ่มให้</p>

        <Link href="/" className="mt-6 block text-center text-[13px] text-ink-500 underline">
          กลับหน้าร้าน
        </Link>
      </div>
    </main>
  );
}
