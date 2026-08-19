"use client";

// ค่าโฆษณา vs ยอดขายจริง — /admin/ads/
//
// ต่อ Facebook Marketing API ตรง ๆ ไม่ผ่านตัวกลางที่คิดเงินรายเดือน
// (Supermetrics ทดลองใช้หมดอายุ 8 ก.ค. 2569 · แพ็กเกจที่ให้ API ราคาหลักพันขึ้นไป)
//
// ⚠️ ตัวเลข "ยอดขายจริง" มาจากออเดอร์ในระบบเราเอง ไม่ใช่ที่พิกเซลรายงาน
//    พิกเซลนับขาดเสมอ (ตัวบล็อกโฆษณา · iOS ตัดคุกกี้ · ปิดหน้าก่อนสคริปต์ทำงาน)
//    ตัวเลขสองฝั่งจึงไม่ตรงกันเป็นเรื่องปกติ — ของเราคือตัวที่ถูก
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Cfg { fb: { on: boolean; accountId: string; hasToken: boolean } }

interface Row {
  name: string; spend: number; impressions: number; clicks: number;
  purchases: number; revenue: number;
}
interface Report {
  range: { since: string; until: string; days: number };
  fb: { ok: boolean; off?: boolean; error?: string; rows: Row[] };
  sales: { orders: number; revenue: number; pending: number } | null;
  roas: number | null;
  spend: number;
}

const baht = (n: number) =>
  "฿" + Math.round(n).toLocaleString("th-TH");

export default function AdminAds() {
  const [key, setKey] = useState("");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [token, setToken] = useState("");
  const [rep, setRep] = useState<Report | null>(null);
  const [days, setDays] = useState(7);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async (k: string) => {
    if (!k) return;
    const r = await adminFetch("/api/ad-stats", k);
    if (!r.ok) { setMsg("รหัสหลังร้านไม่ถูกต้อง"); return; }
    setCfg(await r.json());
  }, []);
  useEffect(() => { void load(key); }, [key, load]);

  const save = async () => {
    if (!cfg) return;
    setBusy(true); setMsg("");
    const r = await adminFetch("/api/ad-stats", key, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // โทเคนว่าง = ไม่เปลี่ยน (เซิร์ฟเวอร์คงของเดิมไว้) จึงไม่ต้องกรอกซ้ำทุกครั้ง
      body: JSON.stringify({ fb: { ...cfg.fb, token } }),
    });
    setBusy(false);
    if (!r.ok) { setMsg("บันทึกไม่สำเร็จ"); return; }
    setCfg(await r.json());
    setToken("");
    setMsg("บันทึกแล้ว");
  };

  // ⚠️ ต้องกดเอง ไม่ยิงอัตโนมัติ — เจ้าของร้านสั่งไว้ว่าหน้าที่เรียก API ข้างนอกห้ามยิงเอง
  const run = async (d = days) => {
    setBusy(true); setMsg(""); setRep(null);
    const r = await adminFetch(`/api/ad-stats?report=1&days=${d}`, key);
    setBusy(false);
    if (!r.ok) { setMsg("ดึงข้อมูลไม่สำเร็จ"); return; }
    setRep(await r.json());
  };

  const input = "w-full rounded-sm border border-steel-600 px-3 py-2 text-[14px] outline-none focus:border-safety";

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">ค่าโฆษณา vs ยอดขาย</span>
      </header>

      <div className="mx-auto max-w-lg p-3">
        {msg && <p className="mb-3 rounded-sm bg-safety-tint px-3 py-2 text-[13px] text-safety">{msg}</p>}

        {!cfg ? (
          <p className="py-10 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
        ) : (
          <>
            {/* ------------------------------ รายงาน ------------------------------ */}
            <section className="mb-3 rounded-sm bg-white p-4">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => { setDays(d); void run(d); }}
                    disabled={busy}
                    className={`rounded-sm px-3 py-1.5 text-[13px] font-medium disabled:opacity-50 ${
                      days === d ? "bg-safety text-white" : "bg-steel-900 text-ink-700"
                    }`}
                  >
                    {d} วัน
                  </button>
                ))}
                <button
                  onClick={() => void run()}
                  disabled={busy}
                  className="ml-auto rounded-sm bg-ink px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {busy ? "กำลังดึง..." : "ดึงข้อมูล"}
                </button>
              </div>

              {!rep ? (
                <p className="py-6 text-center text-[12.5px] leading-relaxed text-ink-300">
                  กดปุ่มด้านบนเพื่อดึงข้อมูล<br />
                  <span className="text-[11.5px]">(ไม่ดึงอัตโนมัติ — ประหยัดโควตา API)</span>
                </p>
              ) : (
                <>
                  <p className="mb-3 text-[11.5px] text-ink-300">
                    {rep.range.since} ถึง {rep.range.until}
                  </p>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-sm bg-steel-900 p-2.5">
                      <div className="text-[16px] font-bold text-ink">{baht(rep.spend)}</div>
                      <div className="mt-0.5 text-[10.5px] text-ink-300">ค่าโฆษณา</div>
                    </div>
                    <div className="rounded-sm bg-steel-900 p-2.5">
                      <div className="text-[16px] font-bold text-ink">
                        {rep.sales ? baht(rep.sales.revenue) : "—"}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-ink-300">ยอดขายจริง</div>
                    </div>
                    <div className="rounded-sm bg-steel-900 p-2.5">
                      <div className="text-[16px] font-bold text-safety">
                        {rep.roas == null ? "—" : rep.roas.toFixed(2) + "x"}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-ink-300">คืนทุนกี่เท่า</div>
                    </div>
                  </div>

                  {rep.sales && (
                    <p className="mt-2 text-[11.5px] leading-relaxed text-ink-300">
                      ออเดอร์จากเว็บ <b className="text-ink">{rep.sales.orders}</b> ใบ
                      {rep.sales.pending > 0 && <> · รอจ่ายอีก {rep.sales.pending} ใบ (ยังไม่นับ)</>}
                      {rep.roas != null && rep.roas < 1 && (
                        <> — <b className="text-safety">ขาดทุนจากค่าโฆษณา</b> ยอดขายยังไม่คุ้มที่จ่ายไป</>
                      )}
                    </p>
                  )}

                  {/* ยอดขายจากเว็บอย่างเดียว — ออเดอร์ Shopee/Lazada/TikTok ไม่ผ่านระบบนี้ */}
                  <p className="mt-2 rounded-sm bg-steel-900 p-2.5 text-[11px] leading-relaxed text-ink-300">
                    ⚠️ ยอดขายจริงนับเฉพาะ <b>ออเดอร์ที่สั่งผ่าน gucut.com</b> เท่านั้น
                    ออเดอร์จาก Shopee · Lazada · TikTok · LINE ไม่ได้อยู่ในนี้
                    ตัวเลข &ldquo;คืนทุนกี่เท่า&rdquo; จึงเป็นค่าต่ำสุดที่มั่นใจได้ ของจริงสูงกว่านี้
                  </p>

                  {rep.fb.off && (
                    <p className="mt-3 rounded-sm bg-steel-900 p-2.5 text-[12px] text-ink-300">
                      ยังไม่ได้เปิด Facebook Ads — ตั้งค่าด้านล่างก่อน
                    </p>
                  )}
                  {rep.fb.error && (
                    <p className="mt-3 rounded-sm bg-safety-tint p-2.5 text-[12px] leading-relaxed text-safety">
                      Facebook ตอบกลับว่า: {rep.fb.error}
                    </p>
                  )}

                  {rep.fb.rows.length > 0 && (
                    <div className="mt-4">
                      <h2 className="mb-1.5 text-[13px] font-bold text-ink">แยกตามแคมเปญ</h2>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="border-b border-steel-600 text-left text-ink-300">
                              <th className="py-1.5 pr-2 font-medium">แคมเปญ</th>
                              <th className="py-1.5 pr-2 text-right font-medium">ใช้ไป</th>
                              <th className="py-1.5 pr-2 text-right font-medium">คลิก</th>
                              <th className="py-1.5 text-right font-medium">ซื้อ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rep.fb.rows.map((r) => (
                              <tr key={r.name} className="border-b border-steel-800">
                                <td className="py-1.5 pr-2 text-ink">{r.name}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{baht(r.spend)}</td>
                                <td className="py-1.5 pr-2 text-right tabular-nums text-ink-700">
                                  {r.clicks.toLocaleString("th-TH")}
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-ink-700">{r.purchases || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* ------------------------------ ตั้งค่า ------------------------------ */}
            <section className="mb-3 rounded-sm bg-white p-4">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={cfg.fb.on}
                  onChange={(e) => setCfg({ ...cfg, fb: { ...cfg.fb, on: e.target.checked } })}
                  className="mt-0.5 h-4 w-4 accent-[#c42d00]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-ink">Facebook / Instagram Ads</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-300">
                    ดึงค่าโฆษณาที่ใช้จริงมาเทียบกับยอดขายในเว็บ
                  </span>
                </span>
              </label>

              {cfg.fb.on && (
                <div className="mt-2.5">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-ink-700">Ad Account ID</span>
                    <input
                      value={cfg.fb.accountId}
                      onChange={(e) => setCfg({ ...cfg, fb: { ...cfg.fb, accountId: e.target.value } })}
                      className={input}
                      inputMode="numeric"
                      placeholder="263190084598096"
                    />
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-300">
                      ตัวเลขล้วน ไม่ต้องใส่ act_ ข้างหน้า — ดูได้จากลิงก์หน้า Ads Manager ตรง act=
                    </span>
                  </label>

                  <label className="mt-2.5 block">
                    <span className="mb-1 block text-[12px] font-medium text-ink-700">
                      Access Token {cfg.fb.hasToken && <span className="text-safety">(ใส่ไว้แล้ว)</span>}
                    </span>
                    <input
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className={input}
                      type="password"
                      autoComplete="off"
                      placeholder={cfg.fb.hasToken ? "เว้นว่างไว้ = ใช้ตัวเดิม" : ""}
                    />
                  </label>

                  <div className="mt-2 rounded-sm bg-steel-900 p-2.5 text-[11px] leading-relaxed text-ink-300">
                    <b className="text-ink-700">สร้างโทเคนแบบไม่หมดอายุยังไง</b><br />
                    1. เปิด <span className="text-ink-700">business.facebook.com</span> → การตั้งค่าธุรกิจ<br />
                    2. ผู้ใช้ → <span className="text-ink-700">ผู้ใช้ระบบ (System Users)</span> → เพิ่ม → ตั้งชื่อ เช่น &ldquo;gucut รายงาน&rdquo;<br />
                    3. กด <span className="text-ink-700">มอบหมายเนื้อหา</span> → เลือกบัญชีโฆษณา → ให้สิทธิ์ดูผลลัพธ์<br />
                    4. กด <span className="text-ink-700">สร้างโทเคน</span> → เลือกแอป → ติ๊ก <span className="text-ink-700">ads_read</span> → คัดลอกมาวางช่องบน<br />
                    <span className="mt-1 block">โทเคนแบบนี้ไม่หมดอายุ ตั้งครั้งเดียวใช้ยาว</span>
                  </div>
                </div>
              )}
            </section>

            <button
              onClick={save}
              disabled={busy}
              className="w-full rounded-sm bg-safety py-3 text-[15px] font-bold text-white disabled:opacity-50"
            >
              {busy ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
            </button>

            <p className="mt-3 rounded-sm bg-white p-3 text-[11px] leading-relaxed text-ink-300">
              <b className="text-ink-700">ทำไมไม่ใช้ Supermetrics</b><br />
              ทดลองใช้ฟรีหมดอายุ 8 ก.ค. 2569 และแพ็กเกจที่เปิดให้ดึงข้อมูลเข้าเว็บเองราคาหลักพันถึงหลักหมื่นต่อเดือน
              ต่อ API ของแต่ละเจ้าเองได้ผลเหมือนกัน ไม่มีค่ารายเดือน และข้อมูลสดกว่า
              <span className="mt-1.5 block">
                <b className="text-ink-700">ทำเพิ่มได้อีก:</b> Google Ads · TikTok Ads ·
                และยอดขาย Shopee / Lazada / TikTok Shop ผ่าน ZORT ที่ต่อไว้แล้ว
              </span>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
