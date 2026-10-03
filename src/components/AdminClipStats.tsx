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

/* 🔴 **B10 (แก้ 4 ต.ค. 2569)** — ช่องที่ "ยังไม่รู้" ต้องขึ้นขีด ไม่ใช่เลข 0
   0 เป็นคำยืนยันว่า "ไม่มีใครดู" ซึ่งผิดได้ · ขีดคือ "ยังไม่รู้" ซึ่งผิดไม่ได้ */
const เลขหรือขีด = (n: number, ไม่รู้: boolean) => (ไม่รู้ ? "—" : n.toLocaleString("th-TH"));

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
  /* 🔴 **B10** — ช่องที่เซิร์ฟเวอร์อ่านไม่ได้ ส่งมาในเนื้อ JSON (`unreadable` · `countsUnknown`)
     ⚠️ ทำไมต้องอ่านจากเนื้อ ไม่ใช่จาก `r.ok`: เส้นนี้ตอบ **200** เมื่อ Blobs สะดุด
        (แถวที่อ่านได้ก็ยังมีประโยชน์) ⇒ ด่าน `r.ok` ข้างล่าง **มองไม่เห็นเคสนี้เลย**
     ⚠️ `undefined` = ท่อรุ่นเก่ายังไม่ส่งช่องนี้มา ⇒ ต่างจาก `[]` ที่แปลว่า "อ่านได้ครบ" */
  const [ไม่รู้, setไม่รู้] = useState<string[] | null>(null);
  const [หัวใจไม่รู้, setหัวใจไม่รู้] = useState(false);

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
      setไม่รู้(Array.isArray(j?.unreadable) ? j.unreadable : null);
      setหัวใจไม่รู้(j?.countsUnknown === true);
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

  // ช่องไหนที่เซิร์ฟเวอร์บอกว่าอ่านไม่ได้ (ทั้งสามพังแยกกันได้)
  const วิวไม่รู้ = !!ไม่รู้?.includes("views");
  const ครึ่งไม่รู้ = !!ไม่รู้?.includes("half");
  const จบไม่รู้ = !!ไม่รู้?.includes("full");
  const มีของอ่านไม่ได้ = (ไม่รู้?.length ?? 0) > 0 || หัวใจไม่รู้;
  const ช่องที่อ่านไม่ได้ = [
    วิวไม่รู้ && "คนดู", ครึ่งไม่รู้ && "ดูถึงครึ่ง", จบไม่รู้ && "ดูจนจบ",
    หัวใจไม่รู้ && "หัวใจ/คอมเมนต์",
  ].filter(Boolean).join(" · ");

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

      {/* 🔴 **B10** — อ่านบางช่องไม่ได้ ต้องเขียนบนจอ ไม่ใช่ปล่อยให้เป็น 0 เงียบ ๆ
          ⚠️ กล่องนี้อยู่ **เหนือ** ตัวเลขสรุป เพราะคนอ่านเลขก่อนอ่านเชิงอรรถ */}
      {มีของอ่านไม่ได้ && (
        <p className="m-3 rounded-sm bg-[#fff4e5] p-3 text-[13px] leading-relaxed text-[#7a4a00]">
          ⚠️ ตอนนี้ <b>อ่านข้อมูลบางช่องไม่ได้</b> ({ช่องที่อ่านไม่ได้}) —
          ช่องเหล่านั้นขึ้นขีดไว้ <b>ไม่ได้แปลว่าเป็นศูนย์</b> และจำนวนคลิปที่เห็นอาจไม่ครบ
          กดรีเฟรชอีกครั้งในอีกสักครู่
        </p>
      )}

      {/* สรุปรวม */}
      <section className="m-3 rounded-lg bg-white p-4">
        <h2 className="text-[13px] font-semibold text-ink">ภาพรวมทั้งหมด</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="คนดู" value={totalViews} ไม่รู้={วิวไม่รู้} />
          {/* สัดส่วนเชื่อถือได้เฉพาะตอนรู้ทั้งตัวตั้งและตัวหาร
              ⚠️ คอมเมนต์ใน JSX ต้องห่อด้วยปีกกาและอยู่ **นอก** แท็กเปิด —
                 คอมเมนต์แบบ C เปล่า ๆ ในรายการ attribute ไม่ถูกไวยากรณ์
                 และ SWC จะฟ้องที่บรรทัด **ก่อนหน้า** ซึ่งชี้ผิดที่
              ⚠️ และห้ามพิมพ์เครื่องหมายปิดคอมเมนต์ลงในเนื้อคอมเมนต์ — มันปิดตัวเองกลางทาง */}
          <Stat
            label="ดูถึงครึ่ง"
            value={totalHalf}
            ไม่รู้={ครึ่งไม่รู้}
            sub={ครึ่งไม่รู้ || วิวไม่รู้ ? "—" : `${pct(totalHalf, totalViews)}%`}
          />
          <Stat
            label="ดูจนจบ"
            value={totalFull}
            ไม่รู้={จบไม่รู้}
            sub={จบไม่รู้ || วิวไม่รู้ ? "—" : `${pct(totalFull, totalViews)}%`}
          />
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
          /* 🔴 **B10 — ข้อความนี้คือตัวบั๊ก ไม่ใช่ถ้อยคำ**
             ของเดิมขึ้น "ยังไม่มีข้อมูล · ตัวเลขจะขึ้นเมื่อมีลูกค้าเข้าไปดูคลิป" ทุกกรณี
             ⇒ ตอน Blobs อ่านรายชื่อคีย์ไม่ได้ จอก็ขึ้นประโยคนี้ ซึ่งเป็น
                **คำอธิบายที่ฟังขึ้นสำหรับเหตุขัดข้อง** ⇒ คนอ่านแล้วเลิกสงสัย
             ⇒ ว่างเพราะอ่านไม่ได้ ต้องพูดอีกอย่าง */
          <div className="p-4">
            {มีของอ่านไม่ได้ ? (
              <>
                <p className="text-[14px] font-medium text-ink">ยังไม่รู้ — อ่านข้อมูลไม่ได้</p>
                <p className="mt-1 text-[13px] leading-relaxed text-steel-300">
                  ที่เก็บข้อมูลตอบไม่ได้ในรอบนี้ จึงยังไม่รู้ว่ามีคนดูคลิปเท่าไหร่
                  <b> ไม่ได้แปลว่าไม่มีคนดู</b> — กดรีเฟรชอีกครั้งในอีกสักครู่
                </p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-medium text-ink">ยังไม่มีข้อมูล</p>
                <p className="mt-1 text-[13px] leading-relaxed text-steel-300">
                  ตัวเลขจะขึ้นเมื่อมีลูกค้าเข้าไปดูคลิปในหน้าวิดีโอ
                  และดูค้างนานพอที่จะนับเป็นการดูจริง
                </p>
              </>
            )}
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
                      {/* 🔴 B10: ช่องที่อ่านไม่ได้ขึ้นขีดรายแถวด้วย ไม่ใช่เตือนแต่หัวจอ
                          — คนอ่านตัวเลขในแถว ไม่ได้อ่านกล่องเตือนทุกครั้ง */}
                      <b className="text-[14px] text-ink">{เลขหรือขีด(r.views, วิวไม่รู้)}</b>
                      <span className="text-steel-300">คนดู</span>
                      <span className="text-steel-300">·</span>
                      <span className="text-ink">
                        ถึงครึ่ง {ครึ่งไม่รู้ || วิวไม่รู้ ? "—" : `${pct(r.half, r.views)}%`}
                      </span>
                      <span className="text-steel-300">·</span>
                      <span className="text-ink">
                        ดูจบ {จบไม่รู้ || วิวไม่รู้ ? "—" : `${pct(r.full, r.views)}%`}
                      </span>
                    </div>

                    {/* 🔴 B10: อ่านยอดหัวใจไม่ได้ ⇒ เงื่อนไข `> 0` เป็นเท็จ ⇒ **บรรทัดนี้หายไปเลย**
                        ⇒ "ไม่รู้" กลายเป็น "ไม่มี" โดยการหายไปของทั้งบรรทัด (เงียบที่สุด) */}
                    {หัวใจไม่รู้ ? (
                      <p className="mt-1 text-[12px] text-steel-300">♥ — · 💬 — (อ่านไม่ได้)</p>
                    ) : (r.likes > 0 || r.comments > 0) && (
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

function Stat(
  { label, value, sub, ไม่รู้ = false }:
  { label: string; value: number; sub?: string; ไม่รู้?: boolean },
) {
  return (
    <div className="rounded-sm bg-steel-900 py-3">
      {/* 🔴 B10: ไม่รู้ ⇒ ขีด · 0 เป็นคำยืนยันที่ผิดได้ ขีดไม่ผิด */}
      <b className="block font-heading text-[22px] leading-tight text-ink">
        {เลขหรือขีด(value, ไม่รู้)}
      </b>
      {sub && <span className="block text-[12px] font-medium text-safety">{sub}</span>}
      <span className="mt-0.5 block text-[12px] text-steel-300">{label}</span>
    </div>
  );
}
