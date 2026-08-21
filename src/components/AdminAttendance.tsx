"use client";

// หลังร้าน: ลงเวลาพนักงาน — /admin/attendance/
// วันนี้ใครมา/สาย/ยังไม่กดเลิกงาน · ตารางทั้งเดือน · จัดการพนักงาน+PIN · ตั้งเวลาเข้างาน
// แก้เวลาย้อนหลังได้ (เผื่อพนักงานลืมกด) — รายการที่แก้มือจะติดธง "แก้แล้ว"
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Emp { id: string; name: string; pin: string; active: boolean }
interface Rec { name: string; in: number; out: number | null; late: number; edited?: boolean; photoIn?: boolean; photoOut?: boolean }
interface Data {
  month: string;                       // "YYYY-MM"
  today: string;                       // "YYYY-MM-DD"
  emp: Emp[];
  cfg: { start: string; end: string; photo?: boolean };
  days: Record<string, Record<string, Rec>>;
}

/** เปิดรูปตอนลงเวลาในแท็บใหม่ — ต้องแนบรหัสหลังร้าน จึงดึงเป็นไฟล์แล้วเปิดจากหน่วยความจำ
 *  ⚠️ ใส่ URL ตรง ๆ ในแท็บใหม่ไม่ได้ เพราะรหัสอยู่ในหัวข้อความ ไม่ได้อยู่ในคุกกี้ */
async function openPhoto(key: string, adminKey: string) {
  const { adminFetch: f } = await import("@/lib/admin");
  const r = await f(`/api/time?photo=${encodeURIComponent(key)}`, adminKey);
  if (!r.ok) { alert("ไม่พบรูปของรายการนี้"); return; }
  const url = URL.createObjectURL(await r.blob());
  window.open(url, "_blank", "noopener");
  // ปล่อยคืนหน่วยความจำหลังเปิดแล้ว
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const hm = (ms: number) =>
  new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

/** ชั่วโมงทำงานเป็นข้อความ เช่น "8:30 ชม." */
function hours(rec: Rec) {
  if (!rec.out) return "";
  const m = Math.max(0, Math.round((rec.out - rec.in) / 60000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} ชม.`;
}

export default function AdminAttendance() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [month, setMonth] = useState("");     // "" = เดือนปัจจุบัน
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  // ฟอร์มพนักงาน: null = ปิด, {} = เพิ่มใหม่, มี id = แก้คนเดิม
  const [form, setForm] = useState<Partial<Emp> | null>(null);

  useEffect(() => { setKey(requireKey()); }, []);

  const load = useCallback(async (k: string, m: string) => {
    try {
      const r = await adminFetch("/api/time" + (m ? `?month=${m}` : ""), k);
      if (r.status === 401) { window.location.replace("/admin/?next=/admin/attendance/"); return; }
      if (!r.ok) throw new Error();
      setData(await r.json());
      setErr("");
    } catch {
      setErr("โหลดข้อมูลไม่สำเร็จ — รีเฟรชหน้านี้อีกครั้ง");
    }
  }, []);

  useEffect(() => { if (key) load(key, month); }, [key, month, load]);

  async function post(body: object) {
    setBusy(true); setErr("");
    try {
      const r = await adminFetch("/api/time", key, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || "ไม่สำเร็จ"); return false; }
      await load(key, month);
      return true;
    } catch {
      setErr("ต่อกับเซิร์ฟเวอร์ไม่ได้");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** กดที่ช่องในตาราง → แก้เวลาย้อนหลังด้วย prompt (เครื่องมือร้าน เอาเร็วไว้ก่อน) */
  async function editCell(date: string, e: Emp, rec?: Rec) {
    const tIn = prompt(`${e.name} · ${date}\nเวลาเข้างาน (เช่น 09:00 · เว้นว่าง = ลบทั้งวัน)`,
      rec ? hm(rec.in) : "");
    if (tIn === null) return;
    let tOut: string | null = "";
    if (tIn.trim()) {
      tOut = prompt("เวลาเลิกงาน (เว้นว่าง = ยังไม่เลิก)", rec?.out ? hm(rec.out) : "");
      if (tOut === null) return;
    }
    await post({ action: "edit", date, id: e.id, in: tIn.trim(), out: (tOut || "").trim() });
  }

  if (!key || !data) {
    return (
      <main className="min-h-[100dvh] bg-steel-900">
        <p className="px-3 py-16 text-center text-[13px] text-ink-300">{err || "กำลังโหลด..."}</p>
      </main>
    );
  }

  const active = data.emp.filter((e) => e.active !== false);
  const todayRec = data.days[data.today] || {};
  const isThisMonth = data.today.startsWith(data.month);

  // รายชื่อวันของเดือน (ใหม่→เก่า) เฉพาะวันที่ผ่านมาแล้ว
  const daysInMonth = new Date(+data.month.slice(0, 4), +data.month.slice(5, 7), 0).getDate();
  const dayList = Array.from({ length: daysInMonth }, (_, i) =>
    `${data.month}-${String(i + 1).padStart(2, "0")}`)
    .filter((d) => d <= data.today)
    .reverse();

  // สรุปต่อคนทั้งเดือน
  const sum = active.map((e) => {
    let come = 0, late = 0, mins = 0;
    for (const d of dayList) {
      const r = data.days[d]?.[e.id];
      if (!r) continue;
      come++;
      if (r.late > 0) late++;
      if (r.out) mins += Math.max(0, Math.round((r.out - r.in) / 60000));
    }
    return { e, come, late, hours: Math.round(mins / 6) / 10 };
  });

  function shiftMonth(n: number) {
    const [y, m] = data!.month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <main className="min-h-[100dvh] bg-steel-900 pb-10">
      <header className="flex items-center gap-1 bg-ink px-2 py-3 text-white">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[22px] leading-none">‹</Link>
        <span className="text-[15px] font-medium">ลงเวลาพนักงาน</span>
        <a href="/time/" target="_blank" rel="noreferrer"
           className="ml-auto rounded-sm border border-white/25 px-2.5 py-1 text-[12px] text-white/80">
          เปิดหน้าให้พนักงานกด ›
        </a>
      </header>

      <div className="mx-auto max-w-lg space-y-3 p-2">
        {err && <p className="px-1 text-[13px] font-medium text-safety">{err}</p>}

        {/* ---------- วันนี้ ---------- */}
        {isThisMonth && (
          <section className="rounded-xl bg-white p-3">
            <h2 className="text-[14px] font-semibold text-ink">วันนี้ ({data.today})</h2>
            {active.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-300">ยังไม่มีพนักงาน — เพิ่มที่ด้านล่างก่อน</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {active.map((e) => {
                  const r = todayRec[e.id];
                  return (
                    <li key={e.id} className="flex items-center gap-2 text-[13px]">
                      <span className={"h-2 w-2 shrink-0 rounded-full " +
                        (!r ? "bg-steel-500" : r.out ? "bg-steel-400" : "bg-[#1f9254]")} />
                      <span className="min-w-0 flex-1 truncate text-ink">{e.name}</span>
                      {!r ? (
                        <span className="text-ink-300">ยังไม่มา</span>
                      ) : (
                        <span className="tabular-nums text-ink-500">
                          {hm(r.in)}
                          {r.late > 0 && <b className="text-safety"> สาย{r.late}น.</b>}
                          {" – "}{r.out ? hm(r.out) : <b className="text-[#1f9254]">กำลังทำงาน</b>}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* ---------- ทั้งเดือน ---------- */}
        <section className="rounded-xl bg-white p-3">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-[14px] font-semibold text-ink">ทั้งเดือน {data.month}</h2>
            <button onClick={() => shiftMonth(-1)} className="rounded-sm border border-steel-600 px-2 py-0.5 text-[13px]">‹</button>
            <button onClick={() => shiftMonth(1)} disabled={isThisMonth}
                    className="rounded-sm border border-steel-600 px-2 py-0.5 text-[13px] disabled:opacity-30">›</button>
          </div>

          {/* สรุปต่อคน */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[320px] text-[12px]">
              <thead>
                <tr className="text-left text-ink-500">
                  <th className="py-1 font-medium">พนักงาน</th>
                  <th className="py-1 text-right font-medium">มา (วัน)</th>
                  <th className="py-1 text-right font-medium">สาย (วัน)</th>
                  <th className="py-1 text-right font-medium">รวม (ชม.)</th>
                </tr>
              </thead>
              <tbody>
                {sum.map(({ e, come, late, hours: h }) => (
                  <tr key={e.id} className="border-t border-steel-800 text-ink">
                    <td className="py-1.5">{e.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{come}</td>
                    <td className={"py-1.5 text-right tabular-nums " + (late ? "font-semibold text-safety" : "")}>{late}</td>
                    <td className="py-1.5 text-right tabular-nums">{h.toLocaleString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* รายวัน — กดที่เวลาเพื่อแก้ */}
          <div className="mt-3 space-y-2">
            {dayList.map((d) => {
              const recs = data.days[d] || {};
              const has = active.some((e) => recs[e.id]);
              return (
                <div key={d} className="rounded-sm bg-steel-900 px-2.5 py-2">
                  <p className="text-[12px] font-semibold text-ink-700">
                    {new Date(`${d}T12:00:00+07:00`).toLocaleDateString("th-TH",
                      { weekday: "short", day: "numeric", month: "short" })}
                  </p>
                  {!has ? (
                    <p className="text-[12px] text-ink-300">— ไม่มีใครลงเวลา —</p>
                  ) : (
                    active.filter((e) => recs[e.id]).map((e) => {
                      const r = recs[e.id];
                      return (
                        <div key={e.id} className="flex w-full items-center gap-1.5 py-0.5 text-[12px]">
                          <button onClick={() => editCell(d, e, r)} disabled={busy}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left">
                            <span className="min-w-0 flex-1 truncate text-ink">{e.name}</span>
                            <span className="tabular-nums text-ink-500">
                              {hm(r.in)}{r.late > 0 && <b className="text-safety"> สาย{r.late}น.</b>}
                              {" – "}{r.out ? hm(r.out) : "?"}
                              {r.out && <span className="text-ink-300"> · {hours(r)}</span>}
                              {r.edited && <span className="text-ink-300"> ✎</span>}
                            </span>
                          </button>
                          {r.photoIn && (
                            <button title="รูปตอนเข้างาน" onClick={() => openPhoto(`${d}/${e.id}/in`, key)}
                                    className="shrink-0 text-[13px] leading-none">📷</button>
                          )}
                          {r.photoOut && (
                            <button title="รูปตอนเลิกงาน" onClick={() => openPhoto(`${d}/${e.id}/out`, key)}
                                    className="shrink-0 text-[13px] leading-none opacity-60">📷</button>
                          )}
                        </div>
                      );
                    })
                  )}
                  {/* เพิ่มเวลาให้คนที่ไม่มีบันทึกวันนั้น */}
                  {active.some((e) => !recs[e.id]) && (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-[11px] text-ink-300">เพิ่มเวลาให้คนที่ขาด…</summary>
                      {active.filter((e) => !recs[e.id]).map((e) => (
                        <button key={e.id} onClick={() => editCell(d, e)} disabled={busy}
                                className="block py-0.5 text-[12px] text-ink-500 underline">
                          {e.name}
                        </button>
                      ))}
                    </details>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-ink-300">กดที่บรรทัดเวลาเพื่อแก้ย้อนหลัง · ✎ = ร้านแก้มือ</p>
        </section>

        {/* ---------- พนักงาน ---------- */}
        <section className="rounded-xl bg-white p-3">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 text-[14px] font-semibold text-ink">พนักงาน</h2>
            <button onClick={() => setForm({})} className="rounded-sm bg-safety px-2.5 py-1 text-[12px] font-semibold text-white">
              + เพิ่ม
            </button>
          </div>
          <ul className="mt-1.5 space-y-1">
            {data.emp.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-[13px]">
                <span className={"min-w-0 flex-1 truncate " + (e.active === false ? "text-ink-300 line-through" : "text-ink")}>
                  {e.name} <span className="text-ink-300">PIN {e.pin}</span>
                </span>
                <button onClick={() => setForm(e)} className="text-[12px] text-ink-500 underline">แก้</button>
                <button
                  onClick={() => post({ action: "emp-save", emp: { ...e, active: e.active === false } })}
                  disabled={busy}
                  className="text-[12px] text-ink-500 underline"
                >
                  {e.active === false ? "เปิดใช้" : "พักงาน"}
                </button>
              </li>
            ))}
            {data.emp.length === 0 && <li className="text-[13px] text-ink-300">ยังไม่มีพนักงาน</li>}
          </ul>

          {form && (
            <form
              className="mt-3 space-y-2 rounded-sm bg-steel-900 p-2.5"
              onSubmit={async (ev) => {
                ev.preventDefault();
                if (await post({ action: "emp-save", emp: { ...form, active: form.active !== false } })) setForm(null);
              }}
            >
              <input
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ชื่อพนักงาน"
                className="w-full rounded-sm border border-steel-600 bg-white px-2.5 py-2 text-[14px] outline-none focus:border-safety"
              />
              <input
                value={form.pin || ""}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                placeholder="PIN 4-6 หลัก (ให้พนักงานจำ)"
                inputMode="numeric"
                className="w-full rounded-sm border border-steel-600 bg-white px-2.5 py-2 text-[14px] tracking-widest outline-none focus:border-safety"
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy}
                        className="flex-1 rounded-sm bg-safety py-2 text-[13px] font-semibold text-white disabled:opacity-50">
                  บันทึก
                </button>
                <button type="button" onClick={() => setForm(null)}
                        className="rounded-sm border border-steel-600 px-3 text-[13px] text-ink-500">
                  ยกเลิก
                </button>
              </div>
            </form>
          )}
        </section>

        {/* ---------- ตั้งเวลาของร้าน ---------- */}
        <section className="rounded-xl bg-white p-3">
          <h2 className="text-[14px] font-semibold text-ink">เวลาทำงานของร้าน</h2>
          <div className="mt-2 flex items-center gap-2 text-[13px] text-ink">
            เข้างาน
            <input type="time" defaultValue={data.cfg.start} id="cfg-start"
                   className="rounded-sm border border-steel-600 px-2 py-1.5 outline-none focus:border-safety" />
            เลิกงาน
            <input type="time" defaultValue={data.cfg.end} id="cfg-end"
                   className="rounded-sm border border-steel-600 px-2 py-1.5 outline-none focus:border-safety" />
            <button
              disabled={busy}
              onClick={() =>
                post({
                  action: "cfg",
                  start: (document.getElementById("cfg-start") as HTMLInputElement).value,
                  end: (document.getElementById("cfg-end") as HTMLInputElement).value,
                })}
              className="ml-auto rounded-sm bg-safety px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
            >
              บันทึก
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-300">มาหลังเวลาเข้างาน = นับว่าสาย (โชว์ในรายงานและแจ้งใน Telegram)</p>

          <label className="mt-3 flex items-start gap-2.5 border-t border-steel-800 pt-3">
            <input
              type="checkbox"
              checked={!!data.cfg.photo}
              disabled={busy}
              onChange={(ev) => post({ action: "cfg", photo: ev.target.checked })}
              className="mt-0.5 h-4 w-4 accent-[#c42d00]"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ink">ถ่ายรูปตอนลงเวลา</span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-300">
                กล้องหน้าจะถ่ายหนึ่งใบตอนกดปุ่ม กัน &ldquo;ฝากเพื่อนกดให้&rdquo; ·
                ดูรูปได้จากไอคอน 📷 ในตาราง · กล้องไม่ติดก็ยังลงเวลาได้ปกติ ·
                <b className="text-ink-500"> ต้องบอกพนักงานก่อนเปิดใช้ (กฎหมาย PDPA)</b>
              </span>
            </span>
          </label>
        </section>

        <p className="px-1 text-[12px] leading-relaxed text-ink-300">
          พนักงานลงเวลาเองที่ <b className="text-ink-500">gucut.com/time/</b> — แชร์ลิงก์นี้ให้พนักงาน
          หรือเปิดค้างไว้ในแท็บเล็ตหน้าร้านก็ได้ ทุกการกดเด้งแจ้งเข้ากลุ่ม Telegram เหมือนออเดอร์
        </p>
      </div>
    </main>
  );
}
