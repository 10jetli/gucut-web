"use client";

// หน้าแชทฝั่งร้าน — เปิดที่ /admin/chat/ ใส่รหัสครั้งเดียว จำไว้ในเครื่อง
// รหัสตั้งที่ Netlify → Environment variables → CHAT_ADMIN_KEY
import { useCallback, useEffect, useRef, useState } from "react";

interface Room {
  cid: string; name: string; phone: string;
  product: { h: string; t: string } | null;
  last: { from: string; text: string; at: number } | null;
  unread: number; n: number;
}
interface Msg { from: "c" | "s"; text: string; at: number; by?: string }

const KEY = "gucut-admin-key";
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
  const [input, setInput] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setKey(localStorage.getItem(KEY) || ""); }, []);

  const loadRooms = useCallback(async (k: string) => {
    try {
      const r = await fetch("/api/chat", { headers: { "x-admin-key": k } });
      if (r.status === 401) { setErr("รหัสไม่ถูกต้อง"); localStorage.removeItem(KEY); setKey(""); return; }
      if (!r.ok) throw new Error();
      setRooms((await r.json()).rooms || []);
      setErr("");
    } catch { setErr("ต่อกับเซิร์ฟเวอร์ไม่ได้"); }
  }, []);

  const loadThread = useCallback(async (k: string, cid: string) => {
    try {
      const r = await fetch(`/api/chat?cid=${cid}`, { headers: { "x-admin-key": k } });
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
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": key },
      body: JSON.stringify({ cid: open, text }),
    }).catch(() => {});
    loadThread(key, open);
    loadRooms(key);
  }

  async function removeRoom(target: string) {
    if (!confirm("ลบห้องแชทนี้ทิ้ง? ข้อความทั้งหมดจะหายถาวร")) return;
    await fetch(`/api/chat?cid=${target}`, { method: "DELETE", headers: { "x-admin-key": key } }).catch(() => {});
    setOpen(null);
    setRooms((r) => r.filter((x) => x.cid !== target));
    loadRooms(key);
  }

  // ---------- ยังไม่ได้ใส่รหัส ----------
  if (!key) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16">
        <h1 className="mb-1 font-heading text-lg font-bold">แชทลูกค้า</h1>
        <p className="mb-4 text-[13px] text-steel-300">
          ใส่รหัสร้านครั้งเดียว เครื่องนี้จะจำไว้ให้
        </p>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { localStorage.setItem(KEY, input.trim()); setKey(input.trim()); } }}
          placeholder="รหัสร้าน"
          className="w-full rounded-sm border border-steel-700 px-3 py-2.5 text-[14px] outline-none focus:border-safety"
        />
        {err && <p className="mt-2 text-[13px] text-safety">{err}</p>}
        <button
          onClick={() => { if (input.trim()) { localStorage.setItem(KEY, input.trim()); setKey(input.trim()); } }}
          className="mt-3 w-full rounded-sm bg-safety py-2.5 font-heading text-sm font-semibold text-white"
        >
          เข้าใช้งาน
        </button>
      </main>
    );
  }

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
        <span className="font-heading text-[15px] font-extrabold italic leading-none">
          <span className="text-safety">GU</span><span className="text-[#c9cacc]">CUT</span>
        </span>
        <span className="text-[14px] font-semibold text-white">แชทลูกค้า</span>
        {totalUnread > 0 && (
          <span className="rounded-full bg-safety px-2 py-0.5 text-[11px] font-bold text-white">{totalUnread}</span>
        )}
        <button onClick={() => { localStorage.removeItem(KEY); setKey(""); }}
          className="ml-auto text-[12px] text-white/60">ออก</button>
      </header>

      {err && <p className="bg-safety-tint px-3 py-2 text-[13px] text-safety">{err}</p>}

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
