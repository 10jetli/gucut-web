"use client";

// เข้าสู่ระบบ / สมัครสมาชิก — เลย์เอาต์เดียวกับ Shopee
// สมัครแบ่ง 2 จังหวะ: ใส่เบอร์ → ถัดไป → ตั้งชื่อกับรหัสผ่าน
//
// ปุ่มเข้าสู่ระบบด้วยบัญชีอื่น: เปิด/ปิดรายเจ้าด้วย env — ดูตรง SOCIAL ด้านล่าง
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { login, register } from "@/lib/account";

const digits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 10);
const okPhone = (v: string) => /^0\d{8,9}$/.test(v);

// ---------- ปุ่มเข้าสู่ระบบด้วยบัญชีอื่น ----------
// LINE / Facebook / Google ต่อเสร็จแล้ว (netlify/lib/oauth.mjs)
// เปิดใช้ทีละเจ้าโดยตั้ง env ฝั่งหน้าเว็บคู่กับคีย์ฝั่งเซิร์ฟเวอร์ — ดู .env.example
// เจ้าไหนยังไม่เปิด กดแล้วจะขึ้นกล่องอธิบายแทน ไม่ใช่กดแล้วเงียบ
const LINE_ON = process.env.NEXT_PUBLIC_LINE_LOGIN === "1";
const FACEBOOK_ON = process.env.NEXT_PUBLIC_FACEBOOK_LOGIN === "1";
const GOOGLE_ON = process.env.NEXT_PUBLIC_GOOGLE_LOGIN === "1";
const SOCIAL = [
  { id: "facebook", label: "Facebook", Icon: FacebookIcon, on: FACEBOOK_ON },
  { id: "google", label: "Google", Icon: GoogleIcon, on: GOOGLE_ON },
  { id: "line", label: "LINE", Icon: LineIcon, on: LINE_ON },
] as const;

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [help, setHelp] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [back, setBack] = useState("/account/");

  // สมัคร/ล็อกอินเสร็จแล้วพากลับหน้าที่มาจาก (เช่น หน้าเช็คเอาต์)
  // และถ้าเพิ่งถูกส่งกลับมาจาก LINE พร้อมข้อความผิดพลาด ให้แสดงด้วย
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const n = q.get("next") || "";
    if (/^\/[a-z0-9\-/]*$/i.test(n)) setBack(n);
    const e = q.get("err");
    if (e) setErr(e.slice(0, 200));
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      if (mode === "login") await login(phone, pw, remember);
      else await register(phone, name, pw, remember);
      router.replace(back);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ระบบขัดข้อง");
      setBusy(false);
    }
  }

  function soon(what: string) {
    setHelp({
      title: `${what} — ยังไม่เปิดให้บริการ`,
      body: "ตอนนี้เข้าสู่ระบบด้วยหมายเลขโทรศัพท์กับรหัสผ่านได้เลยครับ ถ้ายังไม่มีบัญชี กดสมัครด้านล่างได้ ใช้เวลาไม่ถึงนาที",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const isLogin = mode === "login";
  const title = isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
  const canNext = okPhone(phone);
  const canSubmit = isLogin
    ? okPhone(phone) && pw.length > 0
    : name.trim().length > 0 && pw.length >= 8;
  const showNext = !isLogin && step === 1;

  return (
    <main className="flex min-h-[100dvh] flex-col bg-steel-800">
      {/* ---------- แถบหัว ---------- */}
      <header className="flex items-center gap-1 border-b border-steel-700 px-1 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.625rem)]">
        <button
          onClick={() => (step === 2 ? setStep(1) : router.back())}
          aria-label="ย้อนกลับ"
          className="-m-1 p-3 text-safety active:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[2]">
            <path d="M20 12H4m0 0l7-7m-7 7l7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-[17px] font-medium text-ink">{title}</h1>
        <button
          onClick={() =>
            setHelp((v) =>
              v ? null : {
                title: "เข้าสู่ระบบไม่ได้?",
                body: "ลืมรหัสผ่าน หรือเบอร์เดิมใช้ไม่ได้แล้ว ทักแชทหาร้านได้เลยครับ ทีมงานกู้บัญชีให้ภายในวันเดียว",
              },
            )
          }
          aria-label="ความช่วยเหลือ"
          aria-expanded={!!help}
          className="-m-1 ml-auto p-3 text-safety active:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-current stroke-[1.7]">
            <circle cx="12" cy="12" r="9.25" />
            <path d="M9.6 9.3a2.5 2.5 0 114.4 1.9c-.8.8-2 1.1-2 2.4" strokeLinecap="round" />
            <circle cx="12" cy="17" r=".9" className="fill-current stroke-none" />
          </svg>
        </button>
      </header>

      {/* ---------- กล่องช่วยเหลือ ---------- */}
      {help && (
        <div className="border-b border-steel-700 bg-safety-tint px-6 py-3.5 text-[13px] leading-relaxed text-ink-700">
          <p className="mb-1 font-medium text-ink">{help.title}</p>
          <p>{help.body}</p>
          <Link href="/account/" className="mt-2 inline-block font-medium text-safety underline">
            ติดต่อร้าน GUCUT
          </Link>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6">
        {/* ---------- โลโก้ ---------- */}
        <p className="mb-9 mt-11 text-center font-heading text-[40px] font-extrabold italic leading-none tracking-tight">
          <span className="text-safety">GU</span><span className="text-ink">CUT</span>
        </p>

        {/* ---------- เบอร์โทร ---------- */}
        {(isLogin || step === 1) && (
          <label className="flex items-center gap-3 border-b border-steel-700 py-3">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 fill-none stroke-ink-300 stroke-[1.5]">
              <circle cx="12" cy="8" r="3.75" />
              <path d="M4.5 20a7.5 7.5 0 0115 0" strokeLinecap="round" />
            </svg>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => { setPhone(digits(e.target.value)); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && showNext && canNext) setStep(2); }}
              placeholder="หมายเลขโทรศัพท์"
              className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-300"
            />
          </label>
        )}

        {/* ---------- ชื่อ (เฉพาะตอนสมัคร ขั้น 2) ---------- */}
        {!isLogin && step === 2 && (
          <>
            <p className="mb-3 text-center text-[13px] text-ink-500">
              เบอร์ {phone}{" "}
              <button onClick={() => setStep(1)} className="font-medium text-safety underline">แก้ไข</button>
            </p>
            <label className="flex items-center gap-3 border-b border-steel-700 py-3">
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 fill-none stroke-ink-300 stroke-[1.5]">
                <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                <path d="M3.5 9.5h17" strokeLinecap="round" />
              </svg>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setErr(""); }}
                placeholder="ชื่อ-นามสกุล"
                autoComplete="name"
                className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-300"
              />
            </label>
          </>
        )}

        {/* ---------- รหัสผ่าน ---------- */}
        {(isLogin || step === 2) && (
          <label className="flex items-center gap-3 border-b border-steel-700 py-3">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0 fill-none stroke-ink-300 stroke-[1.5]">
              <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
              <path d="M8 10.5V7.5a4 4 0 018 0v3" strokeLinecap="round" />
            </svg>
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
              placeholder={isLogin ? "รหัสผ่าน" : "ตั้งรหัสผ่าน (อย่างน้อย 8 ตัว)"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-300"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              className="shrink-0 p-1 text-ink-300 active:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-[21px] w-[21px] fill-none stroke-current stroke-[1.5]">
                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                <circle cx="12" cy="12" r="3" />
                {!show && <path d="M4 20L20 4" strokeLinecap="round" />}
              </svg>
            </button>
            {isLogin && (
              <>
                <span aria-hidden className="h-5 w-px shrink-0 bg-steel-700" />
                <button
                  type="button"
                  onClick={() =>
                    setHelp({
                      title: "ลืมรหัสผ่าน?",
                      body: "ทักแชทหาร้านพร้อมบอกเบอร์ที่สมัครไว้ ทีมงานตั้งรหัสใหม่ให้ทันทีครับ",
                    })
                  }
                  className="shrink-0 whitespace-nowrap text-[13px] font-medium text-safety active:opacity-60"
                >
                  ลืมรหัสผ่าน?
                </button>
              </>
            )}
          </label>
        )}

        {/* ---------- ข้อความผิดพลาด ---------- */}
        {err && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-[13px] font-medium text-safety">
            <svg viewBox="0 0 24 24" className="mt-[3px] h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[2]">
              <circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5.5" strokeLinecap="round" />
              <circle cx="12" cy="16.5" r=".9" className="fill-current stroke-none" />
            </svg>
            {err}
          </p>
        )}

        {/* ---------- ปุ่มหลัก ---------- */}
        <button
          onClick={() => { if (showNext) { if (canNext) { setStep(2); setErr(""); } } else submit(); }}
          disabled={showNext ? !canNext : !canSubmit || busy}
          className="mt-6 w-full rounded-sm bg-safety py-3.5 text-[15px] font-medium text-white transition-colors active:bg-safety-dark disabled:bg-steel-700 disabled:text-ink-300"
        >
          {showNext ? "ถัดไป" : busy ? "กำลังดำเนินการ..." : title}
        </button>

        {/* ---------- จดจำการเข้าสู่ระบบ · เข้าสู่ระบบด้วย SMS ---------- */}
        {isLogin && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="flex cursor-pointer select-none items-center gap-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="grid h-[18px] w-[18px] place-items-center rounded-[3px] border border-steel-600 bg-white text-white peer-checked:border-safety peer-checked:bg-safety peer-focus-visible:ring-2 peer-focus-visible:ring-safety/40"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-[3.5]">
                  <path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="text-[13px] text-ink-700">จดจำการเข้าสู่ระบบ</span>
            </label>
            <button
              type="button"
              onClick={() => soon("เข้าสู่ระบบด้วย SMS")}
              className="shrink-0 text-[13px] font-medium text-safety active:opacity-60"
            >
              เข้าสู่ระบบด้วย SMS
            </button>
          </div>
        )}

        {/* ---------- หรือ ---------- */}
        {isLogin && (
          <>
            <div className="mt-9 flex items-center gap-4">
              <span className="h-px flex-1 bg-steel-700" />
              <span className="text-[13px] text-ink-300">หรือ</span>
              <span className="h-px flex-1 bg-steel-700" />
            </div>

            <div className="mt-5 space-y-3">
              {SOCIAL.map(({ id, label, Icon, on }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (on) window.location.href = `/api/oauth/${id}?next=${encodeURIComponent(back)}`;
                    else soon(`เข้าสู่ระบบด้วย ${label}`);
                  }}
                  className="relative flex w-full items-center justify-center rounded-sm border border-steel-700 py-3 text-[14px] text-ink active:bg-steel-900"
                >
                  <span className="absolute left-4 grid place-items-center">
                    <Icon />
                  </span>
                  ดำเนินการต่อด้วย {label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ---------- เงื่อนไข ---------- */}
        <p className="mb-7 mt-auto pt-10 text-center text-[11.5px] leading-relaxed text-ink-300">
          โดยการ{isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"} ฉันได้อ่านและยอมรับ{" "}
          <Link href="/account/" className="text-safety">เงื่อนไขการใช้บริการ</Link>
          <br />และ <Link href="/account/" className="text-safety">นโยบายความเป็นส่วนตัว</Link> ของ GUCUT
        </p>
      </div>

      {/* ---------- แถบล่าง สลับโหมด ---------- */}
      <footer className="border-t border-steel-700 bg-steel-900 py-4 text-center text-[13px] text-ink-500">
        {isLogin ? (
          <>ยังไม่มีบัญชีผู้ใช้? <Link href="/account/register/" className="font-medium text-safety">สมัคร</Link></>
        ) : (
          <>มีบัญชีอยู่แล้ว? <Link href="/account/login/" className="font-medium text-safety">เข้าสู่ระบบ</Link></>
        )}
      </footer>
    </main>
  );
}

/* ---------- ไอคอนแบรนด์ (วาดเอง ไม่ต้องโหลดจากข้างนอก) ---------- */

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M15.1 12.5l.4-2.6h-2.5V8.2c0-.7.35-1.4 1.46-1.4h1.14V4.6s-1.03-.18-2.02-.18c-2.06 0-3.4 1.25-3.4 3.5v1.98H7.9v2.6h2.28V19h2.82v-6.5h2.1z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.53 5.53 0 01-2.4 3.63v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.09A12 12 0 0012 24z" />
      <path fill="#FBBC05" d="M5.29 14.28a7.2 7.2 0 010-4.56V6.63H1.28a12 12 0 000 10.74l4.01-3.09z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 001.28 6.63l4.01 3.09C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#06C755" />
      <path
        fill="#fff"
        d="M20 11.06C20 7.5 16.41 4.6 12 4.6S4 7.5 4 11.06c0 3.19 2.85 5.86 6.69 6.37.26.06.61.17.7.39.08.2.05.51.03.71l-.11.68c-.04.2-.16.79.69.43s4.58-2.7 6.25-4.62c1.15-1.26 1.7-2.54 1.7-3.96z"
      />
      <path
        fill="#06C755"
        d="M17.34 13.17h-2.25a.15.15 0 01-.15-.15v-3.5c0-.09.07-.16.15-.16h2.25c.08 0 .15.07.15.16v.57c0 .08-.07.15-.15.15h-1.53v.59h1.53c.08 0 .15.07.15.15v.57c0 .09-.07.15-.15.15h-1.53v.59h1.53c.08 0 .15.07.15.16v.57c0 .08-.07.15-.15.15zm-8.32 0H6.77a.15.15 0 01-.15-.15v-3.5c0-.09.07-.16.15-.16h.57c.09 0 .16.07.16.16v2.78h1.52c.09 0 .16.07.16.16v.57c0 .08-.07.14-.16.14zm1.37 0h-.57a.15.15 0 01-.16-.15v-3.5c0-.09.07-.16.16-.16h.57c.08 0 .15.07.15.16v3.5c0 .08-.07.15-.15.15zm3.88 0h-.57a.15.15 0 01-.13-.07l-1.6-2.17v2.09c0 .08-.07.15-.16.15h-.57a.15.15 0 01-.15-.15v-3.5c0-.09.07-.16.15-.16h.6l.03.01.02.01.02.02 1.6 2.17V9.52c0-.09.07-.16.16-.16h.57c.08 0 .15.07.15.16v3.5c0 .08-.07.15-.15.15z"
      />
    </svg>
  );
}
