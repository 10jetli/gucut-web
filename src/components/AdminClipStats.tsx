"use client";

// สถิติคลิป — /admin/clips/
//
// ตอบคำถามที่เจ้าของร้านถาม 18 ส.ค. 2569: "คนดูคลิปนานไหม คลิปไหนดูเยอะ"
//
// ⚠️ ตัวเลข "คนดู" คือ "จำนวนคน" ไม่ใช่ "จำนวนครั้ง"
//    คนเดิมเปิดดูซ้ำสิบรอบก็ยังนับ 1 (เซิร์ฟเวอร์เก็บหนึ่งคน = หนึ่งคีย์)
//    ตั้งใจให้เป็นแบบนี้ เพราะเอาไปใช้ตัดสินว่าคลิปไหนน่าสนใจจริง
//    และกันคนกดรีเฟรชปั่นยอดตัวเอง
//
// ⚠️ นับเฉพาะคนที่ดูค้างเกิน 5 วินาที (หรือ 60% ของคลิปสั้น) เท่านั้น
//    คนที่เลื่อนผ่านฉิวเดียวไม่ถูกนับ ตัวเลขจึงต่ำกว่า "ยอดวิว" ของ TikTok มาก
//    แต่สะท้อนความสนใจจริงมากกว่า
//
// ค่าเริ่มต้นคือกดรีเฟรชเอง ตามกฎที่เจ้าของร้านสั่งไว้ว่าหน้าหลังร้านห้ามเช็คอัตโนมัติ
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";
import { videoPoster, videos, type ShopVideo } from "@/lib/videos";

interface Row {
  id: string;
  views: number;
  half: number;
  full: number;
  likes: number;
  comments: number;
}

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

const durLabel = (s: number) => {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

export default function AdminClipStats() {
  const [key, setKey] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async (k: string) => {
    if (!k) return;
    setBusy(true);
    try {
      const r = await adminFetch("/api/clip-stats", k);
      if (!r.ok) { setErr("รหัสหลังร้านไม่ถูกต้อง"); return; }
      const j = await r.json();
      // ⚠️ กันรูปแบบไม่ครบเสมอ — ตอน deploy ใหม่ หน้าเว็บเก่ากับ API ใหม่จะอยู่ด้วยกันชั่วครู่
      setRows(Array.isArray(j?.rows) ? j.rows : []);
      setErr("");
    } catch {
      setErr("ดึงข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(key); }, [key, load]);

  // แผนที่ hash คลิป → ข้อมูลคลิป (ไว้โชว์รูปปกกับความยาว)
  const byId = new Map<string, ShopVideo>(videos.map((v) => [v.v, v]));

  const list = rows ?? [];
  const totalViews = list.reduce((s, r) => s + r.views, 0);
  const totalHalf = list.reduce((s, r) => s + r.half, 0);
  const totalFull = list.reduce((s, r) => s + r.full, 0);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="flex-1 text-[15px] font-semibold text-white">สถิติคลิป</span>
        <button
          onClick={() => void load(key)}
          disabled={busy}
          className="rounded-sm bg-white/15 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {busy ? "กำลังโหลด…" : "รีเฟรช"}
        </button>
      </header>

      {err && <p className="m-3 rounded-sm bg-safety-tint p-3 text-[13px] text-safety">{err}</p>}

      {/* สรุปรวม */}
      <section className="m-3 rounded-lg bg-white p-4">
        <h2 className="text-[13px] font-semibold text-ink">ภาพรวมทั้งหมด</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="คนดู" value={totalViews} />
          <Stat label="ดูถึงครึ่ง" value={totalHalf} sub={`${pct(totalHalf, totalViews)}%`} />
          <Stat label="ดูจนจบ" value={totalFull} sub={`${pct(totalFull, totalViews)}%`} />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-steel-300">
          &ldquo;คนดู&rdquo; นับเฉพาะคนที่ดูค้างเกิน 5 วินาที (คนเดิมนับครั้งเดียว)
          คนที่เลื่อนผ่านฉิวเดียวไม่นับ — ตัวเลขจึงน้อยกว่ายอดวิวใน TikTok มาก
          แต่บอกความสนใจจริงได้ตรงกว่า
        </p>
      </section>

      {/* ตารางรายคลิป */}
      <section className="m-3 rounded-lg bg-white">
        <h2 className="border-b border-steel-700 p-4 pb-3 text-[13px] font-semibold text-ink">
          เรียงตามคนดูมากสุด {list.length > 0 && `(${list.length} คลิป)`}
        </h2>

        {rows === null ? (
          <p className="p-4 text-[13px] text-steel-300">กำลังโหลด…</p>
        ) : list.length === 0 ? (
          <div className="p-4">
            <p className="text-[14px] font-medium text-ink">ยังไม่มีข้อมูล</p>
            <p className="mt-1 text-[13px] leading-relaxed text-steel-300">
              ตัวเลขจะขึ้นเมื่อมีลูกค้าเข้าไปดูคลิปในหน้าวิดีโอ
              และดูค้างนานพอที่จะนับเป็นการดูจริง
            </p>
          </div>
        ) : (
          <ul>
            {list.map((r, i) => {
              const v = byId.get(r.id);
              return (
                <li key={r.id} className="flex gap-3 border-b border-steel-700 p-3 last:border-0">
                  <span className="w-5 shrink-0 pt-1 text-[13px] font-semibold text-steel-300">
                    {i + 1}
                  </span>

                  {v ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={videoPoster(v, 240)}
                      alt=""
                      loading="lazy"
                      className="h-[74px] w-[42px] shrink-0 rounded-sm bg-steel-700 object-cover"
                    />
                  ) : (
                    <span className="h-[74px] w-[42px] shrink-0 rounded-sm bg-steel-700" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">
                      {v?.t || "คลิปทั่วไป (ไม่ได้ผูกกับสินค้า)"}
                    </p>
                    <p className="mt-0.5 text-[12px] text-steel-300">
                      {v ? `ยาว ${durLabel(v.dur)} · ` : ""}
                      {r.id.slice(0, 8)}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                      <b className="text-[14px] text-ink">{r.views}</b>
                      <span className="text-steel-300">คนดู</span>
                      <span className="text-steel-300">·</span>
                      <span className="text-ink">ถึงครึ่ง {pct(r.half, r.views)}%</span>
                      <span className="text-steel-300">·</span>
                      <span className="text-ink">ดูจบ {pct(r.full, r.views)}%</span>
                    </div>

                    {(r.likes > 0 || r.comments > 0) && (
                      <p className="mt-1 text-[12px] text-steel-300">
                        ♥ {r.likes} · 💬 {r.comments}
                      </p>
                    )}
                  </div>

                  <Link
                    href={`/videos/?v=${r.id}`}
                    className="shrink-0 self-center rounded-sm border border-steel-700 px-2.5 py-1.5 text-[12px] text-ink"
                  >
                    ดู
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="m-3 mb-8 text-[12px] leading-relaxed text-steel-300">
        <b>อ่านตัวเลขยังไง</b> — &ldquo;ดูจบ&rdquo; ต่ำแต่ &ldquo;คนดู&rdquo; สูง
        แปลว่าคลิปเรียกให้คนหยุดดูได้ แต่ช่วงกลางน่าเบื่อ ลองตัดให้สั้นลง
        ส่วนคลิปที่ &ldquo;ดูจบ&rdquo; สูงคือคลิปที่ควรเอาไปยิงโฆษณา
      </p>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-sm bg-steel-900 py-3">
      <b className="block font-heading text-[22px] leading-tight text-ink">{value}</b>
      {sub && <span className="block text-[12px] font-medium text-safety">{sub}</span>}
      <span className="mt-0.5 block text-[12px] text-steel-300">{label}</span>
    </div>
  );
}
