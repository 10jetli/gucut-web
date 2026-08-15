"use client";

// คอมเมนต์ใต้คลิป — หน้าสำหรับร้านอ่านและลบของที่ไม่เหมาะสม
// คอมเมนต์เปิดให้ใครก็พิมพ์ได้โดยไม่ต้องล็อกอิน จึงต้องมีที่ให้ร้านกวาดบ้าน
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";
import { agoLabel, type VideoComment } from "@/lib/social";

interface Clip {
  id: string;
  comments: VideoComment[];
}

export default function AdminComments() {
  const [key, setKey] = useState("");
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async () => {
    try {
      const counts: Record<string, [number, number]> = await fetch("/api/social")
        .then((r) => r.json())
        .then((d) => d.counts ?? {});
      // เอาเฉพาะคลิปที่มีคอมเมนต์ ใบที่มีเยอะขึ้นก่อน
      const ids = Object.entries(counts)
        .filter(([, c]) => (c?.[1] ?? 0) > 0)
        .sort((a, b) => (b[1][1] ?? 0) - (a[1][1] ?? 0))
        .map(([id]) => id);
      const list = await Promise.all(
        ids.map(async (id) => ({
          id,
          comments: await fetch(`/api/social?id=${encodeURIComponent(id)}`)
            .then((r) => r.json())
            .then((d) => (d.comments ?? []) as VideoComment[])
            .catch(() => []),
        })),
      );
      setClips(list.filter((c) => c.comments.length));
    } catch {
      setErr("โหลดคอมเมนต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
      setClips([]);
    }
  }, []);

  useEffect(() => { if (key) load(); }, [key, load]);

  const remove = async (id: string, cid: string) => {
    setErr("");
    const r = await adminFetch(`/api/social?id=${encodeURIComponent(id)}&cid=${encodeURIComponent(cid)}`, key, {
      method: "DELETE",
    });
    if (!r.ok) { setErr("ลบไม่สำเร็จ — ลองใหม่ หรือเข้าระบบใหม่อีกครั้ง"); return; }
    const d = await r.json().catch(() => null);
    setClips((cur) =>
      (cur ?? [])
        .map((c) => (c.id === id ? { ...c, comments: (d?.comments ?? c.comments.filter((x) => x.i !== cid)) } : c))
        .filter((c) => c.comments.length),
    );
  };

  const total = (clips ?? []).reduce((n, c) => n + c.comments.length, 0);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">คอมเมนต์ใต้คลิป</span>
        {clips && <span className="ml-auto text-[12px] text-white/60">{total} ข้อความ</span>}
      </header>

      {err && <p className="mx-3 mt-3 rounded-sm bg-safety-tint px-3 py-2 text-[13px] text-safety">{err}</p>}

      {clips === null ? (
        <p className="px-3 py-16 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
      ) : clips.length === 0 ? (
        <div className="px-8 py-20 text-center">
          <p className="text-[14px] font-medium text-ink-700">ยังไม่มีคอมเมนต์</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
            เมื่อลูกค้าคอมเมนต์ใต้คลิป จะมาโผล่ที่นี่ และเด้งเข้ากลุ่ม Telegram ของร้านด้วย
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-lg p-3">
          {clips.map((c) => (
            <section key={c.id} className="mb-3 overflow-hidden rounded-sm bg-white">
              <div className="flex items-center gap-2 border-b border-steel-700 px-3 py-2.5">
                <span className="flex-1 truncate text-[12px] text-ink-300">คลิป {c.id.slice(0, 12)}…</span>
                <Link
                  href={`/videos/?v=${c.id}`}
                  target="_blank"
                  className="shrink-0 rounded-sm border border-steel-600 px-2.5 py-1 text-[12px] text-ink-700"
                >
                  ดูคลิป
                </Link>
              </div>
              {c.comments.map((m) => (
                <div key={m.i} className="flex gap-2.5 border-b border-steel-800 px-3 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-ink-300">{m.n} · {agoLabel(m.at)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">{m.t}</p>
                  </div>
                  <button
                    onClick={() => remove(c.id, m.i)}
                    className="h-fit shrink-0 rounded-sm border border-safety px-2.5 py-1 text-[12px] font-medium text-safety"
                  >
                    ลบ
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
