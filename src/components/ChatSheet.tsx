"use client";

import { useEffect, useRef, useState } from "react";
import { SHELL_W } from "@/lib/layout";
import Image from "next/image";

export interface ChatProduct { h: string; t: string; img?: string | null; p?: number }
interface Msg { from: "c" | "s"; text: string; at: number }

const CID_KEY = "gucut-chat-id";
const NAME_KEY = "gucut-chat-name";
const POLL_MS = 5000;

function cid() {
  let v = localStorage.getItem(CID_KEY);
  if (!v) {
    v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36))
      .replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);
    localStorage.setItem(CID_KEY, v);
  }
  return v;
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

export default function ChatSheet({
  open, onClose, product,
}: { open: boolean; onClose: () => void; product?: ChatProduct }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [down, setDown] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(localStorage.getItem(NAME_KEY) || "");
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/chat?cid=${cid()}`);
        if (!r.ok) throw new Error();
        const j = await r.json();
        if (!stop) { setMsgs(j.thread?.messages || []); setDown(false); }
      } catch { if (!stop) setDown(true); }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [open]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, open]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    setMsgs((m) => [...m, { from: "c", text: body, at: Date.now() }]);   // ขึ้นทันที ไม่ต้องรอเซิร์ฟเวอร์
    try {
      if (name) localStorage.setItem(NAME_KEY, name);
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid: cid(), text: body, name, product: product && { h: product.h, t: product.t } }),
      });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setMsgs(j.thread?.messages || []);
      setDown(false);
    } catch { setDown(true); }
    setSending(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className={`mx-auto flex h-[85vh] w-full ${SHELL_W} flex-col rounded-t-2xl bg-steel-900`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* หัวแชท */}
        <div className="flex shrink-0 items-center gap-2 rounded-t-2xl bg-ink px-3 py-3">
          <span className="font-heading text-[15px] font-extrabold italic leading-none">
            <span className="text-safety-light">GU</span><span className="text-[#c9cacc]">CUT</span>
          </span>
          <span className="text-[13px] text-white/70">ตอบกลับภายในเวลาทำการ</span>
          <button onClick={onClose} aria-label="ปิด" className="ml-auto p-1 text-xl leading-none text-white/80">×</button>
        </div>

        {/* สินค้าที่กำลังคุยถึง */}
        {product && (
          <div className="flex shrink-0 items-center gap-2 border-b border-steel-700 bg-steel-800 px-3 py-2">
            {product.img && (
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-steel-700">
                <Image src={product.img} alt="" fill sizes="40px" className="object-contain" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="clamp-2 text-[12px] leading-tight text-ink">{product.t}</p>
              {product.p ? <p className="text-[12px] font-semibold text-safety">฿{product.p.toLocaleString("th-TH")}</p> : null}
            </div>
          </div>
        )}

        {/* ข้อความ */}
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {msgs.length === 0 && (
            <div className="mx-auto max-w-[80%] rounded-lg bg-steel-800 px-3 py-2.5 text-center text-[13px] text-steel-300">
              สอบถามได้เลยครับ — รุ่นไหนใช้กับเครื่องอะไร ราคา ส่งกี่วัน ทางร้านตอบให้ทุกคำถาม
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.from === "c" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed " +
                  (m.from === "c"
                    ? "rounded-br-sm bg-safety text-white"
                    : "rounded-bl-sm bg-steel-800 text-ink")
                }
              >
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={"mt-0.5 text-right text-[10px] " + (m.from === "c" ? "text-white/70" : "text-steel-300")}>
                  {clock(m.at)}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {down && (
          <p className="shrink-0 bg-safety-tint px-3 py-1.5 text-center text-[12px] text-safety">
            ต่อกับร้านไม่ได้ชั่วคราว — ข้อความจะส่งอีกครั้งเมื่อกดส่ง
          </p>
        )}

        {/* ชื่อ (ถามครั้งเดียว) */}
        {!name && (
          <div className="shrink-0 border-t border-steel-700 bg-steel-800 px-3 py-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อของคุณ (เพื่อให้ร้านเรียกถูก)"
              className="w-full rounded-sm border border-steel-700 px-2.5 py-2 text-[13px] outline-none focus:border-safety"
            />
          </div>
        )}

        {/* ช่องพิมพ์ */}
        <div className="flex shrink-0 items-end gap-2 border-t border-steel-700 bg-steel-800 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="พิมพ์ข้อความ..."
            className="max-h-24 flex-1 resize-none rounded-2xl border border-steel-700 px-3 py-2 text-[13px] outline-none focus:border-safety"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="shrink-0 rounded-2xl bg-safety px-4 py-2 text-[13px] font-semibold text-white disabled:bg-steel-700 disabled:text-steel-300"
          >
            ส่ง
          </button>
        </div>
      </div>
    </div>
  );
}
