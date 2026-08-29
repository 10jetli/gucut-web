"use client";

// แผ่นคอมเมนต์ของคลิป — เลื่อนขึ้นมาจากล่างจอแบบ TikTok
// ร้านลบคอมเมนต์ที่ไม่เหมาะสมได้จากหลังร้าน (DELETE /api/social)
import { useEffect, useRef, useState } from "react";
import { SHELL_W } from "@/lib/layout";
import {
  agoLabel, fetchComments, myName, postComment, setMyName, type VideoComment,
} from "@/lib/social";

export default function VideoComments({
  id, open, onClose, onCount,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  onCount: (n: number) => void;   // บอกฟีดให้อัปเดตตัวเลขใต้ปุ่มคอมเมนต์
}) {
  const [list, setList] = useState<VideoComment[] | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(myName());
    setErr("");
    fetchComments(id).then((c) => { setList(c); onCount(c.length); });
  }, [open, id, onCount]);

  if (!open) return null;

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr("");
    try {
      const next = await postComment(id, t, name.trim());
      if (name.trim()) setMyName(name.trim());
      setList(next);
      onCount(next.length);
      setText("");
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ส่งไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center" role="dialog" aria-modal="true">
      <button aria-label="ปิด" className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className={`relative flex h-[72dvh] w-full ${SHELL_W} flex-col rounded-t-2xl bg-white`}>
        {/* หัวแผ่น */}
        <div className="relative shrink-0 border-b border-steel-700 py-3 text-center">
          <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-steel-600" />
          <p className="text-[14px] font-semibold text-ink">
            คอมเมนต์{list ? ` (${list.length})` : ""}
          </p>
          <button onClick={onClose} aria-label="ปิด" className="absolute right-3 top-2.5 p-1 text-[20px] leading-none text-ink-300">
            ✕
          </button>
        </div>

        {/* รายการคอมเมนต์ */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {list === null ? (
            <p className="py-10 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
          ) : list.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[14px] font-medium text-ink-700">ยังไม่มีคอมเมนต์</p>
              <p className="mt-1 text-[12px] text-ink-300">เป็นคนแรกที่ทักไว้เลยสิ</p>
            </div>
          ) : (
            list.map((c) => (
              <div key={c.i} className="flex gap-2.5 border-b border-steel-700 py-3 last:border-0">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-safety-tint text-[13px] font-bold text-safety">
                  {c.n.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-ink-300">
                    {c.n} · {agoLabel(c.at)}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">
                    {c.t}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {/* กล่องพิมพ์ */}
        <div className="shrink-0 border-t border-steel-700 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {err && <p role="alert" className="mb-2 text-[12px] font-medium text-safety">{err}</p>}
          {/* ช่องคอมเมนต์เป็นหลัก อยู่บนสุด — แตะแล้วพิมพ์คอมเมนต์ได้เลย ไม่โดนช่องชื่อก่อน
              (เดิมช่องชื่ออยู่บน ลูกค้าแตะผิดช่อง พิมพ์คอมเมนต์ไม่ได้) */}
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="พิมพ์คอมเมนต์..."
              maxLength={300}
              autoFocus
              className="min-w-0 flex-1 rounded-full border border-steel-700 px-4 py-2.5 text-[14px] outline-none focus:border-safety"
            />
            <button
              onClick={send}
              disabled={!text.trim() || busy}
              className="shrink-0 rounded-full bg-safety px-5 text-[14px] font-semibold text-white disabled:bg-steel-700 disabled:text-ink-300"
            >
              {busy ? "..." : "ส่ง"}
            </button>
          </div>
          {/* ช่องชื่อ = เสริม อยู่ล่าง เล็กและจางกว่า ให้รู้ว่าไม่ใช่ช่องหลัก */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ใส่ชื่อของคุณ (ไม่ใส่ก็ได้)"
            maxLength={40}
            className="mt-2 w-full rounded-full border border-steel-700 px-4 py-1.5 text-[12px] text-ink-300 outline-none focus:border-safety"
          />
        </div>
      </div>
    </div>
  );
}
