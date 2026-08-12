"use client";

// เข้าสู่ระบบ / สมัครสมาชิก — เลย์เอาต์แนวเดียวกับ Shopee
// สมัครแบ่ง 2 จังหวะ: ใส่เบอร์ → ถัดไป → ตั้งชื่อกับรหัสผ่าน
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { login, register } from "@/lib/account";

const digits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 10);
const okPhone = (v: string) => /^0\d{8,9}$/.test(v);

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [back, setBack] = useState("/account/");

  // สมัคร/ล็อกอินเสร็จแล้วพากลับหน้าที่มาจาก (เช่น หน้าเช็คเอาต์)
  useEffect(() => {
    const n = new URLSearchParams(window.location.search).get("next") || "";
    if (/^\/[a-z0-9\-/]*$/i.test(n)) setBack(n);
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
      <header className="flex items-center gap-1 border-b border-steel-700 px-1 py-2.5">
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
          onClick={() => setHelp((v) => !v)}
          aria-label="ความช่วยเหลือ"
          aria-expanded={help}
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
        <div className="border-b border-steel-700 bg-safety-tint px-5 py-3.5 text-[13px] leading-relaxed text-ink-700">
          <p className="mb-1.5 font-medium text-ink">เข้าสู่ระบบไม่ได้?</p>
          <p>ลืมรหัสผ่าน หรือเบอร์เดิมใช้ไม่ได้แล้ว ทักแชทหาร้านได้เลยครับ ทีมงานกู้บัญชีให้ภายในวันเดียว</p>
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
              {show ? (
                <svg viewBox="0 0 24 24" className="h-[21px] w-[21px] fill-none stroke-current stroke-[1.5]">
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-[21px] w-[21px] fill-none stroke-current stroke-[1.5]">
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M4 20L20 4" strokeLinecap="round" />
                </svg>
              )}
            </button>
            {isLogin && (
              <>
                <span aria-hidden className="h-5 w-px shrink-0 bg-steel-700" />
                <button
                  type="button"
                  onClick={() => setHelp(true)}
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

        {/* ---------- จดจำการเข้าสู่ระบบ ---------- */}
        {isLogin && (
          <label className="mt-4 flex cursor-pointer select-none items-center gap-2">
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
        )}

        {/* ---------- เงื่อนไข ---------- */}
        <p className="mb-7 mt-auto pt-10 text-center text-[11.5px] leading-relaxed text-ink-300">
          การ{isLogin ? "เข้าสู่ระบบ" : "สมัครสมาชิก"} ถือว่าฉันได้อ่านและยอมรับ
          <br />เงื่อนไขการให้บริการ และนโยบายความเป็นส่วนตัวของร้าน GUCUT
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
