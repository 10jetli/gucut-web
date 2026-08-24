"use client";

import { useEffect, useRef, useState } from "react";
import { SHELL_W } from "@/lib/layout";
import { SHOP } from "@/lib/shop";
import Image from "next/image";

export interface ChatProduct { h: string; t: string; img?: string | null; p?: number }
interface Msg { from: "c" | "s"; text: string; at: number }

const CID_KEY = "gucut-chat-id";
const NAME_KEY = "gucut-chat-name";
const WAY_KEY = "gucut-chat-way";
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
  // "pick" = ยังไม่ได้เลือกช่องทาง · "web" = คุยในเว็บ
  //
  // ⚠️ คนที่เคยคุยในเว็บไว้แล้ว ต้องเข้าห้องเดิมทันที ห้ามเอาหน้าเลือกช่องทางมาขวาง
  //    ไม่งั้นข้อความที่ร้านตอบไว้จะถูกฝังอยู่หลังปุ่ม แล้วลูกค้าไม่มีวันเห็น
  const [way, setWay] = useState<"pick" | "web">("web");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [down, setDown] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // มีห้องแชทเดิม หรือเคยเลือก "คุยในเว็บ" ไว้ = เข้าห้องเลย
    const hasThread = !!localStorage.getItem(CID_KEY);
    setWay(hasThread || localStorage.getItem(WAY_KEY) === "web" ? "web" : "pick");
  }, [open]);

  useEffect(() => {
    // ⚠️ ห้ามยิง /api/chat ตอนยังอยู่หน้าเลือกช่องทาง
    //    cid() สร้างรหัสห้องแชททิ้งไว้ในเครื่องทันทีที่ถูกเรียก
    //    คนที่เลือกไปคุย LINE ก็จะมีห้องค้าง แล้วปุ่มบนหัวเว็บจะยิงถามทุกนาทีตลอดไป
    //    (ที่ HeaderChat ใช้ "มี cid ไหม" เป็นตัวตัดสินว่าจะยิงหรือไม่)
    if (!open || way !== "web") return;
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
  }, [open, way]);

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
          {way === "web" && (
            <a
              href={SHOP.lineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto rounded-full bg-[#06C755] px-2.5 py-1 text-[11.5px] font-semibold text-white"
            >
              คุยทาง LINE
            </a>
          )}
          <button
            onClick={onClose}
            aria-label="ปิด"
            className={(way === "web" ? "ml-1 " : "ml-auto ") + "p-1 text-xl leading-none text-white/80"}
          >
            ×
          </button>
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

        {/* เลือกช่องทาง — ขึ้นเฉพาะคนที่ยังไม่เคยคุยกับร้าน */}
        {way === "pick" && (
          <div className="flex-1 overflow-y-auto px-4 py-5">
            <p className="text-center text-[13.5px] leading-relaxed text-ink-700">
              อยากคุยกับร้านทางไหนดีครับ
            </p>

            <a
              href={SHOP.lineUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="mt-4 flex items-center gap-3 rounded-xl bg-[#06C755] px-4 py-3.5 text-white"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-7 shrink-0 fill-white">
                <path d="M12 2.7c5.2 0 9.4 3.4 9.4 7.6 0 1.7-.7 3.2-2 4.7-1.9 2.2-6.2 4.9-7.2 5.3-.9.4-.8-.2-.8-.4l.1-.8c0-.3.1-.8-.1-1.1-.2-.3-.7-.5-1.2-.6-3.9-.5-7.6-3.4-7.6-7.1C2.6 6.1 6.8 2.7 12 2.7z" />
              </svg>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold">แชทผ่าน LINE</span>
                <span className="block text-[11.5px] text-white/85">
                  {SHOP.lineOa} · ตอบไวที่สุด เก็บประวัติไว้ในไลน์ของคุณเอง
                </span>
              </span>
            </a>

            <button
              onClick={() => { localStorage.setItem(WAY_KEY, "web"); setWay("web"); }}
              className="mt-2 flex w-full items-center gap-3 rounded-xl border border-steel-700 bg-white px-4 py-3.5 text-left"
            >
              <svg viewBox="0 0 24 24" aria-hidden className="h-7 w-7 shrink-0 fill-none stroke-ink stroke-[1.6]">
                <path
                  d="M21 11.5a8.4 8.4 0 01-9 8.4 9.6 9.6 0 01-2.7-.4L4 21l1.6-4.1A8.1 8.1 0 013 11.5 8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold text-ink">แชทในเว็บนี้</span>
                <span className="block text-[11.5px] text-ink-300">ไม่ต้องออกจากหน้านี้ ไม่ต้องมีไลน์</span>
              </span>
            </button>

            <p className="mt-4 text-center text-[11.5px] leading-relaxed text-ink-300">
              ทั้งสองทางถึงคนเดียวกัน ร้านตอบในเวลาทำการ
            </p>
          </div>
        )}

        {/* ข้อความ */}
        {way === "web" && (
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
        )}

        {way === "web" && down && (
          <p className="shrink-0 bg-safety-tint px-3 py-1.5 text-center text-[12px] text-safety">
            ต่อกับร้านไม่ได้ชั่วคราว — ข้อความจะส่งอีกครั้งเมื่อกดส่ง
          </p>
        )}

        {/* ชื่อ (ถามครั้งเดียว) */}
        {way === "web" && !name && (
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
        {way === "web" && (
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
        )}
      </div>
    </div>
  );
}
