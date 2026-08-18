"use client";

// ตรวจสุขภาพ SEO GEO AEO — /admin/seo/
//
// รวมงานที่เมื่อก่อนต้องจ่ายแอปบน Shopify สองตัว
//   SearchPie SEO & Speed → แท็บ "ค้นหา" กับ "ความเร็ว"
//   Vizby AI              → แท็บ "AI" (ความพร้อมให้ AI หยิบไปตอบ + บอต AI ที่มาจริง)
//
// รายการงานคิดตอน build จากข้อมูลจริงในโปรเจกต์ จึงไม่มีปุ่มสแกน — อัปเดตทุกครั้งที่ deploy
// ส่วนแผง "บอต AI" เป็นข้อมูลสด ต้องกดโหลดเอง (กฎที่เจ้าของร้านสั่ง: ห้ามเช็คอัตโนมัติ)
import Link from "next/link";
import { useCallback, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";
import type { AuditResult, Cat, Finding, Level } from "@/lib/audit";

const LOOK: Record<Level, { label: string; cls: string; dot: string }> = {
  high: { label: "ควรแก้ก่อน", cls: "text-safety", dot: "bg-safety" },
  mid:  { label: "ควรแก้",     cls: "text-[#c47f00]", dot: "bg-[#c47f00]" },
  low:  { label: "ค่อยแก้ก็ได้", cls: "text-ink-300", dot: "bg-steel-600" },
  ok:   { label: "ผ่าน",       cls: "text-[#12a150]", dot: "bg-[#12a150]" },
};

const TABS: { key: Cat; title: string; sub: string; blurb: string }[] = [
  {
    key: "seo",
    title: "ค้นหา",
    sub: "SEO",
    blurb: "ให้คนหาเจอเราใน Google — ชื่อ คำอธิบาย ลิงก์ และเนื้อหาที่ไม่ซ้ำใคร",
  },
  {
    key: "geo",
    title: "ผู้ช่วย AI",
    sub: "GEO · AEO",
    blurb: "ให้ ChatGPT / Gemini / Claude หยิบร้านเราไปตอบเวลาลูกค้าถาม แทนที่จะไปแนะนำร้านอื่น",
  },
  {
    key: "speed",
    title: "ความเร็ว",
    sub: "Speed",
    blurb: "หน้าเว็บหนักแค่ไหน — ลูกค้าต่างจังหวัดเน็ตช้ารอไหวหรือเปล่า",
  },
];

const tone = (n: number) =>
  n >= 80 ? "text-[#12a150]" : n >= 60 ? "text-[#c47f00]" : "text-safety";

interface BotRow { pages: number; days: number; last: string }
interface BotData {
  bots: Record<string, BotRow>;
  days: Record<string, Record<string, number>>;
  pages: { path: string; n: number }[];
  notes: Record<string, { kind: string; note: string }>;
}

const KIND_LABEL: Record<string, string> = {
  ai: "ผู้ช่วย AI",
  search: "เครื่องค้นหา",
  social: "โซเชียล",
};

export default function AdminSeo({ data }: { data: AuditResult }) {
  const [tab, setTab] = useState<Cat>("seo");
  const list = data.findings.filter((f) => f.cat === tab);
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">ตรวจสุขภาพ SEO GEO AEO</span>
      </header>

      <div className="mx-auto max-w-lg p-3 sm:max-w-3xl">
        {/* คะแนนสามด้าน — กดเพื่อสลับแท็บ */}
        <section className="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-sm bg-steel-700">
          {TABS.map((t) => {
            const n = data.scores[t.key];
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={on}
                className={`px-2 py-3 text-center transition ${on ? "bg-white" : "bg-steel-800"}`}
              >
                <p className={`font-heading text-[28px] font-extrabold leading-none ${on ? tone(n) : "text-ink-300"}`}>
                  {n}
                </p>
                <p className={`mt-1 text-[12.5px] font-semibold ${on ? "text-ink" : "text-ink-300"}`}>{t.title}</p>
                <p className="text-[10.5px] text-ink-300">{t.sub}</p>
              </button>
            );
          })}
        </section>

        <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-ink-300">{current.blurb}</p>

        {!data.crawlable && (
          <p className="mb-3 rounded-sm bg-safety-tint px-3 py-2.5 text-[12.5px] leading-relaxed text-safety">
            ⚠️ ตอนนี้ robots.txt ยังปิดไม่ให้เก็บข้อมูลทั้งเว็บ — แก้ข้ออื่นให้ดีแค่ไหนก็ยังไม่มีผล
          </p>
        )}

        {/* งานที่ควรทำในแท็บนี้ */}
        <p className="mb-2 px-1 text-[13px] font-bold text-ink">
          งานที่ควรทำ ({list.length} เรื่อง)
        </p>
        {list.length === 0 && (
          <p className="mb-3 rounded-sm bg-white px-3 py-4 text-center text-[13px] text-[#12a150]">
            ✅ ด้านนี้ไม่มีอะไรค้างแล้ว
          </p>
        )}
        {list.map((f) => <Card key={f.title} f={f} />)}

        {tab === "geo" && <AiBots />}
        {tab === "speed" && <SpeedNote />}
        {tab === "seo" && <DoneList crawlable={data.crawlable} />}

        {/* ตัวเลขรวม */}
        <p className="mb-2 mt-4 px-1 text-[13px] font-bold text-ink">ของที่มีอยู่ในเว็บ</p>
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-steel-700">
          {Object.entries(data.stats).map(([k, v]) => (
            <div key={k} className="bg-white px-3 py-2.5">
              <p className="text-[11px] text-ink-300">{k}</p>
              <p className="font-heading text-[17px] font-bold text-ink">{v.toLocaleString("th-TH")}</p>
            </div>
          ))}
        </section>

        <p className="mt-4 px-1 text-[11.5px] leading-relaxed text-ink-300">
          ตัวเลขทั้งหมดคิดจากข้อมูลจริงในเว็บตอนอัปเดตล่าสุด ไม่ได้ไปยิงเครื่องมือข้างนอก
          จึงไม่มีค่าใช้จ่ายรายเดือนและไม่มีปุ่มสแกน — อัปเดตเองทุกครั้งที่เว็บ deploy
        </p>
      </div>
    </main>
  );
}

function Card({ f }: { f: Finding }) {
  const look = LOOK[f.level];
  return (
    <section className="mb-2 overflow-hidden rounded-sm bg-white">
      <div className="flex items-center gap-2 border-b border-steel-700 px-3 py-2.5">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} />
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">{f.title}</span>
        <span className="shrink-0 font-heading text-[15px] font-bold text-ink">
          {f.count.toLocaleString("th-TH")}
        </span>
        <span className="shrink-0 text-[11px] text-ink-300">{f.unit || "รายการ"}</span>
        <span className={`shrink-0 text-[11px] ${look.cls}`}>{look.label}</span>
      </div>
      <div className="space-y-1.5 px-3 py-2.5 text-[12.5px] leading-relaxed">
        <p className="text-ink-700"><span className="text-ink-300">ทำไมต้องแก้ · </span>{f.why}</p>
        <p className="text-ink-700"><span className="text-ink-300">แก้ยังไง · </span>{f.how}</p>
        {f.sample?.length ? (
          <p className="text-[11.5px] text-ink-300">
            ตัวอย่าง: {f.sample.map((s) => s.slice(0, 46)).join(" · ")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// บอต AI มาเก็บข้อมูลเว็บเราหรือยัง — ข้อมูลสด ต้องกดโหลดเอง
// ---------------------------------------------------------------------------
function AiBots() {
  const [data, setData] = useState<BotData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const k = requireKey();
    if (!k) return;
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch("/api/ai-bots", k);
      if (!r.ok) { setErr(r.status === 401 ? "รหัสหลังร้านไม่ถูกต้อง" : "ดึงข้อมูลไม่สำเร็จ"); return; }
      const j = await r.json();
      // ⚠️ กันรูปแบบไม่ครบเสมอ — ตอน deploy ใหม่ หน้าเก่ากับ API ใหม่อยู่ด้วยกันชั่วครู่
      setData({
        bots: j?.bots && typeof j.bots === "object" ? j.bots : {},
        days: j?.days && typeof j.days === "object" ? j.days : {},
        pages: Array.isArray(j?.pages) ? j.pages : [],
        notes: j?.notes && typeof j.notes === "object" ? j.notes : {},
      });
    } catch {
      setErr("ดึงข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, []);

  const rows = data
    ? Object.entries(data.bots).sort((a, b) => b[1].pages - a[1].pages)
    : [];

  return (
    <section className="mt-4 overflow-hidden rounded-sm bg-white">
      <div className="border-b border-steel-700 px-3 py-2.5">
        <p className="text-[13px] font-bold text-ink">บอต AI มาเก็บข้อมูลเว็บเราหรือยัง</p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-300">
          จดจากคำขอจริงที่วิ่งเข้าเว็บ ตัวบล็อกโฆษณาปิดไม่ได้ — บอกได้ว่า ChatGPT / Gemini /
          Claude / Perplexity เคยมาอ่านหรือยัง อ่านไปกี่หน้า
        </p>
      </div>

      <div className="px-3 py-2.5">
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="min-h-[40px] w-full rounded-sm bg-ink px-4 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "กำลังโหลด…" : data ? "โหลดใหม่" : "ดูข้อมูล"}
        </button>
        {err && <p className="mt-2 text-[12px] text-safety">{err}</p>}
      </div>

      {data && rows.length === 0 && !err && (
        <p className="px-3 pb-3 text-[12.5px] leading-relaxed text-ink-300">
          ยังไม่มีบอตตัวไหนเข้ามาเลย — ปกติสำหรับเว็บที่เพิ่งเปิดให้เก็บข้อมูล
          ปกติ Googlebot จะมาก่อนภายในไม่กี่วัน ส่วนบอตของ AI ใช้เวลานานกว่านั้น
        </p>
      )}

      {rows.length > 0 && (
        <div className="border-t border-steel-700">
          {rows.map(([name, r]) => {
            const kind = data!.notes[name]?.kind || "ai";
            return (
              <div key={name} className="flex items-center gap-2 border-b border-steel-800 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
                  <p className="truncate text-[11px] text-ink-300">
                    {KIND_LABEL[kind] || kind} · {data!.notes[name]?.note || ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-heading text-[15px] font-bold text-ink">
                    {r.pages.toLocaleString("th-TH")}
                  </p>
                  <p className="text-[10.5px] text-ink-300">หน้า · ล่าสุด {r.last}</p>
                </div>
              </div>
            );
          })}
          {data!.pages.length > 0 && (
            <div className="px-3 py-2.5">
              <p className="mb-1 text-[12px] font-semibold text-ink">หน้าที่บอตสนใจมากที่สุด</p>
              <ul className="space-y-0.5 text-[11.5px] leading-relaxed text-ink-300">
                {data!.pages.slice(0, 10).map((p) => (
                  <li key={p.path} className="truncate">{p.n}× · {p.path}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SpeedNote() {
  return (
    <section className="mt-3 rounded-sm bg-white p-4 text-[12.5px] leading-relaxed text-ink-700">
      <p className="mb-2 text-[13px] font-bold text-ink">ของที่ทำให้เร็วไปแล้ว</p>
      <ul className="space-y-1">
        <li>✅ พิกเซลการตลาดโหลดเมื่อลูกค้าขยับตัวเท่านั้น (ประหยัด 391KB สำหรับคนที่เปิดผ่าน)</li>
        <li>✅ คลิปเสิร์ฟผ่าน video.gucut.com พร้อมแคชที่ขอบเครือข่าย</li>
        <li>✅ ฟอนต์ใช้ของเครื่องลูกค้า ไม่โหลดจากข้างนอก</li>
        <li>✅ หน้าเว็บทำเป็นไฟล์นิ่งล่วงหน้าทั้งหมด ไม่ต้องรอเซิร์ฟเวอร์คิด</li>
      </ul>
      <p className="mt-3 text-[11.5px] text-ink-300">
        ตัวเลขในแท็บนี้ดูจาก “ไฟล์รูปในเว็บ” เท่านั้น ส่วนคะแนนความเร็วจริงที่ Google ใช้
        ต้องวัดจาก PageSpeed Insights ซึ่งวัดจากเครื่องลูกค้าจริง
      </p>
    </section>
  );
}

function DoneList({ crawlable }: { crawlable: boolean }) {
  return (
    <section className="mt-3 rounded-sm bg-white p-4">
      <p className="mb-2 text-[13px] font-bold text-ink">ของที่ทำครบแล้ว</p>
      <ul className="space-y-1 text-[12.5px] leading-relaxed text-ink-700">
        <li>✅ ข้อมูลโครงสร้างครบทุกหน้า (สินค้า · หมวด · บทความ · คลิป · ร้าน)</li>
        <li>✅ หน้าคำถามที่พบบ่อย พร้อม FAQPage — ตัวที่ทำให้ถูกหยิบไปตอบ</li>
        <li>✅ llms.txt + agents.md + ฟีดสินค้า /products.json สำหรับผู้ช่วย AI</li>
        <li>✅ 301 จาก URL เดิมบน Shopify</li>
        <li>✅ sitemap ครบทุกหน้า</li>
        <li>✅ ลิงก์ในบทความไม่วิ่งอ้อมผ่าน www อีกแล้ว</li>
        {crawlable && <li>✅ robots.txt เปิดให้ Google และผู้ช่วย AI เข้าเก็บข้อมูล</li>}
      </ul>
    </section>
  );
}
