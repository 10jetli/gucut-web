"use client";

// หลังกดเข้าสู่ระบบด้วย LINE / Facebook ครั้งแรก — ขอเบอร์โทรเพื่อผูกกับบัญชีร้าน
// ทำไมต้องขอ: ออร์เดอร์ทั้งหมดของร้านผูกกับเบอร์โทร ถ้าไม่มีเบอร์
// ลูกค้าเก่าจะเห็นประวัติการสั่งซื้อของตัวเองไม่ได้
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { linkSocial, needsPassword, pendingSocial, type PendingSocial } from "@/lib/account";

const digits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 10);
const okPhone = (v: string) => /^0\d{8,9}$/.test(v);

const BRAND = {
  line: { bg: "#06C755", icon: LineGlyph, ring: false },
  facebook: { bg: "#1877F2", icon: FacebookGlyph, ring: false },
  google: { bg: "#ffffff", icon: GoogleGlyph, ring: true },  // โลโก้ Google ต้องอยู่บนพื้นขาว
} as const;

export default function SocialLink() {
  const router = useRouter();
  const [me, setMe] = useState<PendingSocial | null>(null);
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [askPw, setAskPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // ไม่มีบัญชีค้างอยู่ = เข้าหน้านี้ตรง ๆ หรือหมดเวลา → กลับไปหน้าล็อกอิน
  useEffect(() => {
    pendingSocial().then((p) => {
      if (p) setMe(p);
      else router.replace("/account/login/");
      setReady(true);
    });
  }, [router]);

  async function submit() {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      await linkSocial(phone, askPw ? pw : undefined);
      router.replace("/account/");
    } catch (e) {
      if (needsPassword(e)) {
        // เบอร์นี้เคยสมัครไว้แล้ว ต้องยืนยันตัวตนก่อนผูก
        setAskPw(true);
        setErr("เบอร์นี้เคยสมัครไว้แล้ว ใส่รหัสผ่านเดิมเพื่อยืนยันว่าเป็นเจ้าของ");
      } else {
        setErr(e instanceof Error ? e.message : "ระบบขัดข้อง");
      }
      setBusy(false);
    }
  }

  const canSubmit = okPhone(phone) && (!askPw || pw.length > 0);

  if (!ready) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-steel-800 text-[14px] text-ink-300">
        กำลังตรวจสอบ...
      </main>
    );
  }
  if (!me) return null;

  const brand = BRAND[me.provider] ?? BRAND.line;
  const Glyph = brand.icon;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-steel-800">
      <header className="flex items-center gap-1 border-b border-steel-700 px-1 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)]">
        <Link href="/account/login/" aria-label="ย้อนกลับ" className="-m-1 p-3 text-safety active:opacity-60">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
            <path d="M20 12H4m0 0l7-7m-7 7l7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="text-[17px] font-medium text-ink">ผูกบัญชี {me.label}</h1>
      </header>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6">
        {/* ---------- ทักทายด้วยชื่อจากบัญชีนั้น ---------- */}
        <div className="mt-10 flex flex-col items-center">
          <span
            className={`grid h-16 w-16 place-items-center overflow-hidden rounded-full${
              brand.ring ? " border border-steel-700" : ""
            }`}
            style={{ background: brand.bg }}
          >
            {me.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Glyph />
            )}
          </span>
          <p className="mt-3 text-[17px] font-medium text-ink">สวัสดีครับ {me.name || "คุณลูกค้า"}</p>
          <p className="mt-1 text-center text-[13px] leading-relaxed text-ink-500">
            อีกขั้นเดียว — กรอกเบอร์โทรเพื่อผูกกับบัญชีร้าน
            <br />ครั้งต่อไปกดปุ่ม {me.label} ปุ่มเดียวเข้าได้เลย
          </p>
        </div>

        {/* ---------- เบอร์โทร ---------- */}
        <label className="mt-9 flex items-center gap-3 border-b border-steel-700 py-3">
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 fill-none stroke-ink-300 stroke-[1.5]">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" strokeLinejoin="round" />
          </svg>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => { setPhone(digits(e.target.value)); setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
            placeholder="หมายเลขโทรศัพท์"
            className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-300"
          />
        </label>

        {/* ---------- รหัสผ่าน (เฉพาะเบอร์ที่มีบัญชีเดิม) ---------- */}
        {askPw && (
          <label className="flex items-center gap-3 border-b border-steel-700 py-3">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 fill-none stroke-ink-300 stroke-[1.5]">
              <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
              <path d="M8 10.5V7.5a4 4 0 018 0v3" strokeLinecap="round" />
            </svg>
            <input
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
              placeholder="รหัสผ่านเดิมของเบอร์นี้"
              autoComplete="current-password"
              className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-300"
            />
          </label>
        )}

        {err && <p role="alert" className="mt-3 text-[13px] font-medium text-safety">{err}</p>}

        <button
          onClick={submit}
          disabled={!canSubmit || busy}
          className="mt-6 w-full rounded-sm bg-safety py-3.5 text-[15px] font-medium text-white transition-colors active:bg-safety-dark disabled:bg-steel-700 disabled:text-ink-300"
        >
          {busy ? "กำลังผูกบัญชี..." : "ผูกบัญชีและเข้าสู่ระบบ"}
        </button>

        <p className="mb-7 mt-auto pt-10 text-center text-[11.5px] leading-relaxed text-ink-300">
          ร้านใช้เบอร์โทรเพื่อยืนยันตัวตนและติดตามพัสดุเท่านั้น
          <br />ไม่ส่งต่อให้บุคคลอื่น · <Link href="/policy/privacy/" className="text-safety">นโยบายความเป็นส่วนตัว</Link>
        </p>
      </div>
    </main>
  );
}

function LineGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9 fill-white" aria-hidden>
      <path d="M20 11.06C20 7.5 16.41 4.6 12 4.6S4 7.5 4 11.06c0 3.19 2.85 5.86 6.69 6.37.26.06.61.17.7.39.08.2.05.51.03.71l-.11.68c-.04.2-.16.79.69.43s4.58-2.7 6.25-4.62c1.15-1.26 1.7-2.54 1.7-3.96z" />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.53 5.53 0 01-2.4 3.63v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.09A12 12 0 0012 24z" />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 010-4.56V6.63H1.28a12 12 0 000 10.74l4.01-3.09z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 001.28 6.63l4.01 3.09C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
  );
}

function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9 fill-white" aria-hidden>
      <path d="M15.1 12.5l.4-2.6h-2.5V8.2c0-.7.35-1.4 1.46-1.4h1.14V4.6s-1.03-.18-2.02-.18c-2.06 0-3.4 1.25-3.4 3.5v1.98H7.9v2.6h2.28V19h2.82v-6.5h2.1z" />
    </svg>
  );
}
