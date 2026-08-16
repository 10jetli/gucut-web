"use client";

// ตั้งค่าพิกเซลการตลาด — /admin/marketing/
//
// กรอกรหัสพิกเซลที่นี่ที่เดียว หน้าร้านดึงไปใช้เอง ไม่ต้อง deploy ใหม่
// ช่องที่ปิดสวิตช์ไว้ = ไม่โหลดสคริปต์ของเจ้านั้นเลย เว็บเบาเท่าเดิม
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, requireKey } from "@/lib/admin";

interface Cfg {
  meta: { on: boolean; pixelId: string; token: string; testCode: string };
  tiktok: { on: boolean; pixelId: string; token: string; testCode: string };
  ga4: { on: boolean; id: string };
  ads: { on: boolean; id: string; label: string };
  line: { on: boolean; tagId: string };
  cf: { on: boolean; token: string };
}

export default function AdminMarketing() {
  const [key, setKey] = useState("");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setKey(requireKey()), []);

  const load = useCallback(async (k: string) => {
    if (!k) return;
    const r = await adminFetch("/api/marketing?admin=1", k);
    if (!r.ok) { setMsg("รหัสหลังร้านไม่ถูกต้อง"); return; }
    setCfg(await r.json());
  }, []);
  useEffect(() => { void load(key); }, [key, load]);

  const save = async () => {
    if (!cfg) return;
    setBusy(true); setMsg("");
    // token ที่โชว์เป็นจุด ๆ = ไม่ได้แก้ ส่งค่าว่างไปแทน ฝั่งเซิร์ฟเวอร์จะคงของเดิมไว้
    const clean = (t: string) => (/^•+$/.test(t) ? "" : t);
    const body = {
      ...cfg,
      meta: { ...cfg.meta, token: clean(cfg.meta.token) },
      tiktok: { ...cfg.tiktok, token: clean(cfg.tiktok.token) },
    };
    const r = await adminFetch("/api/marketing", key, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) { setMsg("บันทึกไม่สำเร็จ"); return; }
    setCfg(await r.json());
    setMsg("บันทึกแล้ว — คนที่เพิ่งเข้าเว็บจะเห็นผลภายใน 5 นาที");
  };

  const input = "w-full rounded-sm border border-steel-600 px-3 py-2 text-[14px] outline-none focus:border-safety";
  const F = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <label className="mt-2.5 block">
      <span className="mb-1 block text-[12px] font-medium text-ink-700">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-300">{hint}</span>}
    </label>
  );

  const Card = ({ t, note, on, set, children }: {
    t: string; note: string; on: boolean; set: (b: boolean) => void; children: React.ReactNode;
  }) => (
    <section className="mb-3 rounded-sm bg-white p-4">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ff3c00]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-ink">{t}</span>
          <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-300">{note}</span>
        </span>
      </label>
      {on && <div className="mt-1">{children}</div>}
    </section>
  );

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">พิกเซลการตลาด</span>
      </header>

      <div className="mx-auto max-w-lg p-3">
        {msg && <p className="mb-3 rounded-sm bg-safety-tint px-3 py-2 text-[13px] text-safety">{msg}</p>}

        <p className="mb-3 rounded-sm bg-white p-3 text-[11.5px] leading-relaxed text-ink-300">
          เว็บจะยิงเหตุการณ์ให้อัตโนมัติ 4 อย่าง: <b>เปิดดูสินค้า</b> · <b>หยิบใส่ตะกร้า</b> ·
          {" "}<b>เข้าหน้าสั่งซื้อ</b> · <b>สั่งซื้อสำเร็จ</b> — ช่องไหนปิดสวิตช์ไว้จะไม่โหลดสคริปต์ของเจ้านั้นเลย
        </p>

        {!cfg ? (
          <p className="py-10 text-center text-[13px] text-ink-300">กำลังโหลด...</p>
        ) : (
          <>
            <Card
              t="Meta (Facebook + Instagram)"
              note="รหัสพิกเซลหาได้ที่ Events Manager → Data sources → เลือกพิกเซล → เลข 15-16 หลักใต้ชื่อ"
              on={cfg.meta.on}
              set={(b) => setCfg({ ...cfg, meta: { ...cfg.meta, on: b } })}
            >
              <F label="Pixel ID" hint="ตัวเลขล้วน เช่น 1234567890123456">
                <input value={cfg.meta.pixelId} onChange={(e) => setCfg({ ...cfg, meta: { ...cfg.meta, pixelId: e.target.value } })} className={input} inputMode="numeric" />
              </F>
              <F
                label="Conversions API Token (ไม่ใส่ก็ได้)"
                hint="ใส่แล้วเว็บจะยิงยอดขายจากเซิร์ฟเวอร์ซ้ำอีกทาง — ตัวเลขจะครบกว่ามากเพราะไม่โดนตัวบล็อกโฆษณาหรือ iOS สกัด · หาได้ที่ Events Manager → Settings → Generate access token"
              >
                <input value={cfg.meta.token} onChange={(e) => setCfg({ ...cfg, meta: { ...cfg.meta, token: e.target.value } })} className={input} type="password" autoComplete="off" />
              </F>
              <F label="Test Event Code (ใส่เฉพาะตอนทดสอบ)" hint="ใส่แล้วยอดจะไปโผล่ในหน้า Test Events แทนยอดจริง — ทดสอบเสร็จต้องลบออก">
                <input value={cfg.meta.testCode} onChange={(e) => setCfg({ ...cfg, meta: { ...cfg.meta, testCode: e.target.value } })} className={input} />
              </F>
            </Card>

            <Card
              t="TikTok"
              note="รหัสพิกเซลหาได้ที่ TikTok Ads Manager → Tools → Events → Web Events"
              on={cfg.tiktok.on}
              set={(b) => setCfg({ ...cfg, tiktok: { ...cfg.tiktok, on: b } })}
            >
              <F label="Pixel ID" hint="ตัวอักษรผสมตัวเลข เช่น CABC1DEFG2HIJ3KLMN">
                <input value={cfg.tiktok.pixelId} onChange={(e) => setCfg({ ...cfg, tiktok: { ...cfg.tiktok, pixelId: e.target.value } })} className={input} />
              </F>
              <F label="Events API Token (ไม่ใส่ก็ได้)" hint="ทำงานแบบเดียวกับของ Meta — ยิงยอดขายจากเซิร์ฟเวอร์เพิ่มอีกทาง">
                <input value={cfg.tiktok.token} onChange={(e) => setCfg({ ...cfg, tiktok: { ...cfg.tiktok, token: e.target.value } })} className={input} type="password" autoComplete="off" />
              </F>
            </Card>

            <Card
              t="Google Analytics 4"
              note="ดูว่าคนเข้าเว็บมาจากไหน ดูหน้าไหน ซื้อเท่าไหร่ — ไม่ใช่โฆษณา แต่ใช้วัดผล"
              on={cfg.ga4.on}
              set={(b) => setCfg({ ...cfg, ga4: { ...cfg.ga4, on: b } })}
            >
              <F label="Measurement ID" hint="ขึ้นต้นด้วย G- เช่น G-XXXXXXXXXX">
                <input value={cfg.ga4.id} onChange={(e) => setCfg({ ...cfg, ga4: { ...cfg.ga4, id: e.target.value } })} className={input} />
              </F>
            </Card>

            <Card
              t="Google Ads"
              note="นับ conversion ตอนลูกค้าสั่งซื้อสำเร็จ ใช้กับโฆษณา Google/YouTube"
              on={cfg.ads.on}
              set={(b) => setCfg({ ...cfg, ads: { ...cfg.ads, on: b } })}
            >
              <F label="Conversion ID" hint="ขึ้นต้นด้วย AW- เช่น AW-123456789">
                <input value={cfg.ads.id} onChange={(e) => setCfg({ ...cfg, ads: { ...cfg.ads, id: e.target.value } })} className={input} />
              </F>
              <F label="Conversion Label" hint="ตัวอักษรสั้น ๆ ที่ Google ให้มาคู่กับ ID เช่น AbC-D_efG12hIjKlm">
                <input value={cfg.ads.label} onChange={(e) => setCfg({ ...cfg, ads: { ...cfg.ads, label: e.target.value } })} className={input} />
              </F>
            </Card>

            <Card
              t="Cloudflare Web Analytics"
              note="ดูจำนวนคนเข้า หน้ายอดนิยม มาจากไหน ใช้เครื่องอะไร — เบากว่า GA4 สิบกว่าเท่า (11 KB) และไม่ใช้คุกกี้เลย"
              on={cfg.cf?.on ?? false}
              set={(b) => setCfg({ ...cfg, cf: { ...cfg.cf, on: b } })}
            >
              <F
                label="Beacon Token"
                hint={"หาได้ที่ Cloudflare → Analytics & Logs → Web Analytics → Add a site → ใส่ gucut.com "
                  + "แล้วก๊อปค่า token ในบรรทัด data-cf-beacon มาใส่ (ตัวอักษรผสมตัวเลขยาว ๆ) "
                  + "· token นี้ไม่ใช่ความลับ มันฝังอยู่ในหน้าเว็บให้ทุกคนเห็นอยู่แล้ว"}
              >
                <input value={cfg.cf?.token ?? ""} onChange={(e) => setCfg({ ...cfg, cf: { ...cfg.cf, token: e.target.value } })} className={input} autoComplete="off" />
              </F>
            </Card>

            <Card
              t="LINE Tag"
              note="ใช้กับโฆษณาบน LINE — ถ้าไม่ได้ยิงโฆษณา LINE ไม่ต้องเปิด"
              on={cfg.line.on}
              set={(b) => setCfg({ ...cfg, line: { ...cfg.line, on: b } })}
            >
              <F label="Tag ID">
                <input value={cfg.line.tagId} onChange={(e) => setCfg({ ...cfg, line: { ...cfg.line, tagId: e.target.value } })} className={input} />
              </F>
            </Card>

            <button onClick={save} disabled={busy} className="w-full rounded-sm bg-safety py-3 text-[14px] font-semibold text-white disabled:opacity-50">
              {busy ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}
            </button>

            <p className="mt-4 rounded-sm bg-white p-3 text-[11.5px] leading-relaxed text-ink-300">
              <b className="text-ink-700">เปิดพิกเซลแล้วต้องรู้:</b> หน้านโยบายความเป็นส่วนตัวของร้าน
              จะเปลี่ยนข้อความตามอัตโนมัติ ว่ามีการใช้คุกกี้เพื่อโฆษณา — เป็นข้อกำหนดของ PDPA
              และเป็นเงื่อนไขที่ Meta กับ Google ตรวจก่อนอนุมัติบัญชีโฆษณา
            </p>
          </>
        )}
      </div>
    </main>
  );
}
