"use client";

// ค่าโฆษณา vs ยอดขายจริง — /admin/ads/
//
// ต่อ API ของแต่ละเจ้าตรง ๆ ไม่ผ่านตัวกลางที่คิดเงินรายเดือน
// (Supermetrics ทดลองใช้หมดอายุ 8 ก.ค. 2569 · แพ็กเกจที่ให้ API ราคาหลักพันขึ้นไป)
//
// ⚠️ ตัวเลข "ยอดขายจริง" มาจากออเดอร์ในระบบเราเอง ไม่ใช่ที่พิกเซลรายงาน
//    พิกเซลนับขาดเสมอ (ตัวบล็อกโฆษณา · iOS ตัดคุกกี้ · ปิดหน้าก่อนสคริปต์ทำงาน)
//    ตัวเลขสองฝั่งจึงไม่ตรงกันเป็นเรื่องปกติ — ของเราคือตัวที่ถูก
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Cfg {
  fb: { on: boolean; accountId: string; hasToken: boolean };
  google: {
    on: boolean; customerId: string; loginCustomerId: string;
    hasDeveloperToken: boolean; hasClientId: boolean;
    hasClientSecret: boolean; hasRefreshToken: boolean;
  };
}

interface Row {
  name: string; spend: number; impressions: number; clicks: number;
  purchases: number; revenue: number;
}
interface Src { ok: boolean; off?: boolean; error?: string; rows: Row[] }
interface Report {
  range: { since: string; until: string; days: number };
  fb: Src;
  google: Src;
  sales: { orders: number; revenue: number; pending: number } | null;
  roas: number | null;
  spend: number;
  spendBy: { fb: number; google: number };
}

const baht = (n: number) => "฿" + Math.round(n).toLocaleString("th-TH");

// ค่าลับที่เคยบันทึกไว้จะไม่ถูกส่งกลับมาหน้าเว็บเลย — ช่องจึงว่างเสมอ
// เว้นว่างไว้ = ใช้ของเดิม (เซิร์ฟเวอร์เป็นคนคงค่าไว้ ดู saveConfig)
const SECRET_HINT = "เว้นว่างไว้ = ใช้ค่าเดิม";

export default function AdminAds() {
  const [key, setKey] = useState("");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [secret, setSecret] = useState<Record<string, string>>({});
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
      body: JSON.stringify({
        fb: { ...cfg.fb, token: secret.fbToken || "" },
        google: {
          ...cfg.google,
          developerToken: secret.gDev || "",
          clientId: secret.gId || "",
          clientSecret: secret.gSecret || "",
          refreshToken: secret.gRefresh || "",
        },
      }),
    });
    setBusy(false);
    if (!r.ok) { setMsg("บันทึกไม่สำเร็จ"); return; }
    setCfg(await r.json());
    setSecret({});
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

  // ⚠️ autoComplete="off" ไม่พอ — Chrome เดาว่าเป็นฟอร์มล็อกอินแล้วเติมอีเมล/รหัสให้เอง
  //    เคยเกิดจริง 20 ส.ค. 2569: Chrome เติมอีเมลลงช่อง Ad Account ID แล้วถูกบันทึกเป็น "10"
  //    ต้องใช้ค่าที่ Chrome ไม่รู้จักถึงจะกันได้
  const noFill = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true" } as const;

  const Field = ({ label, hint, value, onChange, secretMode = false, saved = false }: {
    label: string; hint?: string; value: string;
    onChange: (v: string) => void; secretMode?: boolean; saved?: boolean;
  }) => (
    <label className="mt-2.5 block">
      <span className="mb-1 block text-[12px] font-medium text-ink-700">
        {label} {saved && <span className="text-safety">(ใส่ไว้แล้ว)</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={input}
        type={secretMode ? "password" : "text"}
        placeholder={secretMode && saved ? SECRET_HINT : ""}
        {...noFill}
      />
      {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-300">{hint}</span>}
    </label>
  );

  const Table = ({ title, src, note }: { title: string; src: Src; note?: string }) => {
    if (src.off) return null;
    return (
      <div className="mt-4">
        <h2 className="mb-1.5 text-[13px] font-bold text-ink">{title}</h2>
        {src.error && (
          <p className="mb-2 whitespace-pre-line rounded-sm bg-safety-tint p-2.5 text-[11.5px] leading-relaxed text-safety">
            {src.error}
          </p>
        )}
        {src.rows.length > 0 && (
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
                {src.rows.map((r) => (
                  <tr key={r.name} className="border-b border-steel-800">
                    <td className="py-1.5 pr-2 text-ink">{r.name}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{baht(r.spend)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-ink-700">
                      {Math.round(r.clicks).toLocaleString("th-TH")}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-ink-700">
                      {r.purchases ? Math.round(r.purchases).toLocaleString("th-TH") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {note && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-300">{note}</p>}
      </div>
    );
  };

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

                  {/* แยกให้เห็นว่าเงินไปอยู่เจ้าไหน — ตัดสินใจว่าจะหยุดเจ้าไหนได้ทันที */}
                  {rep.spend > 0 && (
                    <div className="mt-2 flex gap-2 text-[11.5px]">
                      <span className="rounded-sm bg-steel-900 px-2 py-1 text-ink-700">
                        Facebook <b className="text-ink">{baht(rep.spendBy.fb)}</b>
                      </span>
                      <span className="rounded-sm bg-steel-900 px-2 py-1 text-ink-700">
                        Google <b className="text-ink">{baht(rep.spendBy.google)}</b>
                      </span>
                    </div>
                  )}

                  {rep.sales && (
                    <p className="mt-2 text-[11.5px] leading-relaxed text-ink-300">
                      ออเดอร์จากเว็บ <b className="text-ink">{rep.sales.orders}</b> ใบ
                      {rep.sales.pending > 0 && <> · รอจ่ายอีก {rep.sales.pending} ใบ (ยังไม่นับ)</>}
                    </p>
                  )}

                  {/* ยอดขายจากเว็บอย่างเดียว — ออเดอร์ Shopee/Lazada/TikTok ไม่ผ่านระบบนี้ */}
                  <p className="mt-2 rounded-sm bg-steel-900 p-2.5 text-[11px] leading-relaxed text-ink-300">
                    ⚠️ ยอดขายจริงนับเฉพาะ <b>ออเดอร์ที่สั่งผ่าน gucut.com</b> เท่านั้น
                    ออเดอร์จาก Shopee · Lazada · TikTok · LINE ไม่ได้อยู่ในนี้
                    ตัวเลข &ldquo;คืนทุนกี่เท่า&rdquo; จึงเป็นค่าต่ำสุดที่มั่นใจได้ ของจริงสูงกว่านี้
                  </p>

                  <Table title="Facebook / Instagram" src={rep.fb} />
                  <Table
                    title="Google Ads"
                    src={rep.google}
                    note="ช่อง &ldquo;ซื้อ&rdquo; คือจำนวนคอนเวอร์ชั่นที่ Google บันทึกได้ — ถ้าเป็น 0 ทั้งที่มีคนซื้อจริง แปลว่าคนไปซื้อช่องทางอื่น (LINE / Shopee / โทร) ซึ่ง Google มองไม่เห็น"
                  />
                </>
              )}
            </section>

            {/* --------------------------- ตั้งค่า Facebook --------------------------- */}
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
                    ตั้งง่าย ใช้โทเคนใบเดียว
                  </span>
                </span>
              </label>

              {cfg.fb.on && (
                <div className="mt-2.5">
                  <Field
                    label="Ad Account ID"
                    hint="ตัวเลขล้วน ไม่ต้องใส่ act_ ข้างหน้า — ดูได้จากลิงก์หน้า Ads Manager ตรง act="
                    value={cfg.fb.accountId}
                    onChange={(v) => setCfg({ ...cfg, fb: { ...cfg.fb, accountId: v } })}
                  />
                  <Field
                    label="Access Token"
                    value={secret.fbToken || ""}
                    onChange={(v) => setSecret({ ...secret, fbToken: v })}
                    secretMode
                    saved={cfg.fb.hasToken}
                  />
                </div>
              )}
            </section>

            {/* ---------------------------- ตั้งค่า Google ---------------------------- */}
            <section className="mb-3 rounded-sm bg-white p-4">
              <label className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={cfg.google.on}
                  onChange={(e) => setCfg({ ...cfg, google: { ...cfg.google, on: e.target.checked } })}
                  className="mt-0.5 h-4 w-4 accent-[#c42d00]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-ink">Google Ads</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-300">
                    ต้องขออนุมัติจาก Google ก่อน ใช้เวลา 1-3 วัน
                  </span>
                </span>
              </label>

              {cfg.google.on && (
                <div className="mt-2.5">
                  <Field
                    label="Customer ID"
                    hint="เลขบัญชีโฆษณา ตัวเลขล้วนไม่ต้องมีขีด (745-572-5873 → 7455725873) ดูมุมขวาบนของหน้า Google Ads"
                    value={cfg.google.customerId}
                    onChange={(v) => setCfg({ ...cfg, google: { ...cfg.google, customerId: v } })}
                  />
                  <Field
                    label="Login Customer ID (ใส่เฉพาะถ้ามีบัญชีผู้ดูแล)"
                    hint="เลขบัญชีผู้ดูแล (MCC) ที่คุมบัญชีข้างบนอยู่ — ไม่มีก็เว้นว่าง"
                    value={cfg.google.loginCustomerId}
                    onChange={(v) => setCfg({ ...cfg, google: { ...cfg.google, loginCustomerId: v } })}
                  />
                  <Field
                    label="Developer Token"
                    value={secret.gDev || ""}
                    onChange={(v) => setSecret({ ...secret, gDev: v })}
                    secretMode
                    saved={cfg.google.hasDeveloperToken}
                  />
                  <Field
                    label="Client ID"
                    value={secret.gId || ""}
                    onChange={(v) => setSecret({ ...secret, gId: v })}
                    secretMode
                    saved={cfg.google.hasClientId}
                  />
                  <Field
                    label="Client Secret"
                    value={secret.gSecret || ""}
                    onChange={(v) => setSecret({ ...secret, gSecret: v })}
                    secretMode
                    saved={cfg.google.hasClientSecret}
                  />
                  <Field
                    label="Refresh Token"
                    value={secret.gRefresh || ""}
                    onChange={(v) => setSecret({ ...secret, gRefresh: v })}
                    secretMode
                    saved={cfg.google.hasRefreshToken}
                  />

                  <div className="mt-2 rounded-sm bg-steel-900 p-2.5 text-[11px] leading-relaxed text-ink-300">
                    <b className="text-ink-700">ทำไมช่องเยอะกว่า Facebook</b><br />
                    Facebook ให้โทเคนใบเดียวจบ แต่ Google บังคับให้ผ่าน 3 ระบบ:
                    บัญชีผู้ดูแล (Developer Token) · Google Cloud (Client ID/Secret) ·
                    การกดยินยอม (Refresh Token)
                    <span className="mt-1.5 block">
                      <b className="text-ink-700">Developer Token ต้องรออนุมัติ</b> —
                      ตอนขอครั้งแรกจะได้แบบ &ldquo;ทดสอบ&rdquo; ซึ่งดึงบัญชีจริงไม่ได้
                      ต้องกดขอ <b className="text-ink-700">Basic Access</b> แล้วรอ Google ตรวจ 1-3 วัน
                    </span>
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
                <b className="text-ink-700">ทำเพิ่มได้อีก:</b> TikTok Ads ·
                และยอดขาย Shopee / Lazada / TikTok Shop ผ่าน ZORT ที่ต่อไว้แล้ว
              </span>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
