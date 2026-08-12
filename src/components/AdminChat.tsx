"use client";

// หน้าแชทฝั่งร้าน — เปิดที่ /admin/chat/
// ต้องล็อกอินที่ /admin/ ก่อน (ยังไม่ล็อกอินจะเด้งไปเอง)
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch, clearKey, requireKey } from "@/lib/admin";

interface Room {
  cid: string; name: string; phone: string;
  product: { h: string; t: string } | null;
  last: { from: string; text: string; at: number } | null;
  unread: number; n: number;
}
interface Msg { from: "c" | "s"; text: string; at: number; by?: string }

const POLL_MS = 5000;

const when = (ms: number) => {
  const d = new Date(ms), now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same
    ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

export default function AdminChat() {
  const [key, setKey] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [err, setErr] = useState("");
  const [push, setPush] = useState<"off" | "on" | "busy" | "blocked" | "ios">("off");
  const endRef = useRef<HTMLDivElement>(null);

  // ยังไม่ล็อกอิน requireKey จะพาไปหน้า /admin/ ให้เอง
  useEffect(() => { setKey(requireKey()); }, []);

  // เช็คว่าเครื่องนี้เปิดการแจ้งเตือนไว้หรือยัง
  useEffect(() => {
    if (!key) return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPush(iOS && !standalone ? "ios" : "blocked");
      return;
    }
    if (iOS && !standalone) { setPush("ios"); return; }
    if (Notification.permission === "denied") { setPush("blocked"); return; }
    navigator.serviceWorker.getRegistration().then(async (r) => {
      const sub = await r?.pushManager.getSubscription();
      setPush(sub ? "on" : "off");
    });
  }, [key]);

  const b64 = (s: string) => {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };

  async function enablePush() {
    setPush("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPush("blocked"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { key: pub } = await fetch("/api/push").then((r) => r.json());
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(pub) }));
      const r = await adminFetch("/api/push", key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!r.ok) throw new Error();
      await adminFetch("/api/push", key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      setPush("on");
    } catch { setPush("off"); setErr("เปิดการแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง"); }
  }

  async function disablePush() {
    setPush("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await adminFetch("/api/push", key, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
    } catch { /* ไม่เป็นไร */ }
    setPush("off");
  }

  const loadRooms = useCallback(async (k: string) => {
    try {
      const r = await adminFetch("/api/chat", k);
      if (r.status === 401) { clearKey(); window.location.replace("/admin/"); return; }
      if (!r.ok) throw new Error();
      setRooms((await r.json()).rooms || []);
      setErr("");
    } catch { setErr("ต่อกับเซิร์ฟเวอร์ไม่ได้"); }
  }, []);

  const loadThread = useCallback(async (k: string, cid: string) => {
    try {
      const r = await adminFetch(`/api/chat?cid=${cid}`, k);
      if (!r.ok) throw new Error();
      setMsgs((await r.json()).thread?.messages || []);
    } catch { /* เงียบไว้ รอบหน้าค่อยลองใหม่ */ }
  }, []);

  useEffect(() => {
    if (!key) return;
    loadRooms(key);
    const t = setInterval(() => { loadRooms(key); if (open) loadThread(key, open); }, POLL_MS);
    return () => clearInterval(t);
  }, [key, open, loadRooms, loadThread]);

  useEffect(() => { if (open && key) loadThread(key, open); }, [open, key, loadThread]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs]);

  async function send() {
    const text = reply.trim();
    if (!text || !open) return;
    setReply("");
    setMsgs((m) => [...m, { from: "s", text, at: Date.now() }]);
    await adminFetch("/api/chat", key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid: open, text }),
    }).catch(() => {});
    loadThread(key, open);
    loadRooms(key);
  }

  async function removeRoom(target: string) {
    if (!confirm("ลบห้องแชทนี้ทิ้ง? ข้อความทั้งหมดจะหายถาวร")) return;
    await adminFetch(`/api/chat?cid=${target}`, key, { method: "DELETE" }).catch(() => {});
    setOpen(null);
    setRooms((r) => r.filter((x) => x.cid !== target));
    loadRooms(key);
  }

  // ---------- ยังไม่ล็อกอิน (requireKey กำลังพาไปหน้า /admin/) ----------
  if (!key) return <main className="min-h-[100dvh] bg-steel-900" />;

  const room = rooms.find((r) => r.cid === open);
  const totalUnread = rooms.reduce((a, r) => a + r.unread, 0);

  // ---------- เปิดห้องแชท ----------
  if (open) {
    return (
      <main className="mx-auto flex h-[100dvh] max-w-lg flex-col">
        <header className="flex shrink-0 items-center gap-2 bg-ink px-3 py-3 text-white">
          <button onClick={() => setOpen(null)} className="p-1 text-xl leading-none">‹</button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{room?.name || "ลูกค้า"}</p>
            {room?.product && <p className="truncate text-[11px] text-white/60">{room.product.t}</p>}
          </div>
          {room?.phone && (
            <a href={`tel:${room.phone}`} className="shrink-0 rounded bg-safety px-2.5 py-1 text-[12px] font-medium">
              โทร
            </a>
          )}
          <button onClick={() => removeRoom(open)} aria-label="ลบห้องแชท" className="shrink-0 p-1 text-white/60">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.7]">
              <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto bg-steel-900 px-3 py-3">
          {msgs.map((m, i) => (
            <div key={i} className={m.from === "s" ? "flex justify-end" : "flex justify-start"}>
              <div className={"max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed " +
                (m.from === "s" ? "rounded-br-sm bg-safety text-white" : "rounded-bl-sm bg-white text-ink")}>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={"mt-0.5 text-right text-[10px] " + (m.from === "s" ? "text-white/70" : "text-steel-300")}>
                  {m.by ? `${m.by} · ` : ""}{when(m.at)}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="flex shrink-0 items-end gap-2 border-t border-steel-700 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="ตอบลูกค้า..."
            className="max-h-24 flex-1 resize-none rounded-2xl border border-steel-700 px-3 py-2 text-[13px] outline-none focus:border-safety"
          />
          <button onClick={send} disabled={!reply.trim()}
            className="shrink-0 rounded-2xl bg-safety px-4 py-2 text-[13px] font-semibold text-white disabled:bg-steel-700 disabled:text-steel-300">
            ส่ง
          </button>
        </div>
      </main>
    );
  }

  // ---------- รายการห้องแชท ----------
  return (
    <main className="mx-auto min-h-screen max-w-lg bg-steel-900">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-ink px-3 py-3">
        <Link href="/admin/" aria-label="กลับหน้ารวมหลังร้าน" className="-ml-1 p-1 text-xl leading-none text-white">‹</Link>
        <span className="text-[14px] font-semibold text-white">แชทลูกค้า</span>
        {totalUnread > 0 && (
          <span className="rounded-full bg-safety px-2 py-0.5 text-[11px] font-bold text-white">{totalUnread}</span>
        )}
        <span className="ml-auto font-heading text-[15px] font-extrabold italic leading-none">
          <span className="text-safety">GU</span><span className="text-[#c9cacc]">CUT</span>
        </span>
      </header>

      {err && <p className="bg-safety-tint px-3 py-2 text-[13px] text-safety">{err}</p>}

      {push === "off" && (
        <button onClick={enablePush} className="flex w-full items-center gap-2 bg-safety-tint px-3 py-2.5 text-left">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-safety stroke-[1.7]">
            <path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" />
          </svg>
          <span className="flex-1 text-[13px] font-medium text-safety">
            เปิดการแจ้งเตือน — ลูกค้าทักแล้วเด้งเข้าเครื่องนี้ทันที
          </span>
          <span className="shrink-0 text-[13px] text-safety">›</span>
        </button>
      )}
      {push === "busy" && (
        <p className="bg-safety-tint px-3 py-2.5 text-[13px] text-safety">กำลังเปิดการแจ้งเตือน...</p>
      )}
      {push === "on" && (
        <div className="flex items-center gap-2 bg-[#f0fbf3] px-3 py-2">
          <span className="flex-1 text-[12px] text-[#1f9254]">🔔 เครื่องนี้เปิดการแจ้งเตือนแล้ว</span>
          <button onClick={disablePush} className="text-[12px] text-steel-300 underline">ปิด</button>
        </div>
      )}
      {push === "ios" && (
        <div className="bg-safety-tint px-3 py-2.5 text-[12px] leading-relaxed text-safety">
          <b>อยากให้เด้งเตือนบน iPhone?</b> กดปุ่ม <b>แชร์</b> ด้านล่าง → <b>เพิ่มไปยังหน้าจอโฮม</b>
          <br />แล้วเปิดจากไอคอนบนหน้าจอ จะมีปุ่มเปิดการแจ้งเตือนขึ้นมา
        </div>
      )}
      {push === "blocked" && (
        <p className="bg-steel-800 px-3 py-2 text-[12px] text-steel-300">
          เครื่องนี้ปิดการแจ้งเตือนไว้ — เปิดได้ที่ตั้งค่าเบราว์เซอร์
        </p>
      )}

      {rooms.length === 0 ? (
        <p className="px-3 py-10 text-center text-[13px] text-steel-300">ยังไม่มีข้อความจากลูกค้า</p>
      ) : (
        <ul className="divide-y divide-steel-700 bg-white">
          {rooms.map((r) => (
            <li key={r.cid}>
              <button onClick={() => setOpen(r.cid)} className="flex w-full items-start gap-3 px-3 py-3 text-left">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-steel-900 text-[13px] font-semibold text-steel-300">
                  {(r.name || "ล").trim()[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-ink">{r.name || "ลูกค้า"}</span>
                    {r.last && <span className="ml-auto shrink-0 text-[11px] text-steel-300">{when(r.last.at)}</span>}
                  </span>
                  {r.product && <span className="block truncate text-[11px] text-steel-300">{r.product.t}</span>}
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="clamp-2 flex-1 text-[13px] text-[#4a4a4a]">
                      {r.last ? (r.last.from === "s" ? "คุณ: " : "") + r.last.text : ""}
                    </span>
                    {r.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-safety px-1.5 text-[11px] font-bold text-white">{r.unread}</span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
