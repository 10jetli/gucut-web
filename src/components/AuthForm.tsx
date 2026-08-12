"use client";

// เข้าสู่ระบบ / สมัครสมาชิก — หน้าตาแบบแอปช้อปปิ้ง
// สมัครแบ่ง 2 จังหวะเหมือน Shopee: ใส่เบอร์ → ถัดไป → ตั้งชื่อกับรหัสผ่าน
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
      if (mode === "login") await login(phone, pw);
      else await register(phone, name, pw);
      router.replace(back);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ระบบขัดข้อง");
      setBusy(false);
    }
  }

  const title = mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก";
  const canNext = okPhone(phone);
  const canSubmit =
    mode === "login" ? okPhone(phone) && pw.length > 0 : name.trim().length > 0 && pw.length >= 8;

  return (
    <main className="min-h-[100dvh] bg-white">
      <header className="flex items-center px-2 py-3">
        <button
          onClick={() => (step === 2 ? setStep(1) : router.back())}
          aria-label="ย้อนกลับ"
          className="p-2 text-[22px] leading-none text-safety"
        >
          ‹
        </button>
        <span className="text-[15px] font-medium text-ink">{title}</span>
      </header>

      <div className="mx-auto max-w-xs px-5">
        <p className="mb-8 mt-6 text-center font-heading text-[34px] font-extrabold italic leading-none tracking-tight">
          <span className="text-safety">GU</span><span className="text-ink">CUT</span>
        </p>

        {/* ---------- เบอร์โทร ---------- */}
        {(mode === "login" || step === 1) && (
          <label className="flex items-center gap-2 border-b border-steel-600 py-2.5">
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-ink-300 stroke-[1.6]">
              <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" strokeLinejoin="round" />
            </svg>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => { setPhone(digits(e.target.value)); setErr(""); }}
              placeholder="หมายเลขโทรศัพท์"
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-300"
            />
          </label>
        )}

        {/* ---------- ชื่อ (เฉพาะตอนสมัคร ขั้น 2) ---------- */}
        {mode === "register" && step === 2 && (
          <>
            <p className="mb-4 text-center text-[13px] text-ink-500">
              เบอร์ {phone}{" "}
              <button onClick={() => setStep(1)} className="text-safety underline">แก้ไข</button>
            </p>
            <label className="flex items-center gap-2 border-b border-steel-600 py-2.5">
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-ink-300 stroke-[1.6]">
                <circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0115 0" strokeLinecap="round" />
              </svg>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setErr(""); }}
                placeholder="ชื่อ-นามสกุล"
                autoComplete="name"
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-300"
              />
            </label>
          </>
        )}

        {/* ---------- รหัสผ่าน ---------- */}
        {(mode === "login" || step === 2) && (
          <label className="mt-1 flex items-center gap-2 border-b border-steel-600 py-2.5">
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-none stroke-ink-300 stroke-[1.6]">
              <rect x="4.5" y="10.5" width="15" height="9.5" rx="1.5" />
              <path d="M8 10.5V7.5a4 4 0 018 0v3" strokeLinecap="round" />
            </svg>
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
              placeholder={mode === "login" ? "รหัสผ่าน" : "ตั้งรหัสผ่าน (อย่างน้อย 8 ตัว)"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-300"
            />
            <button onClick={() => setShow(!show)} className="shrink-0 text-[12px] text-ink-300">
              {show ? "ซ่อน" : "ดู"}
            </button>
          </label>
        )}

        {err && <p className="mt-3 text-[13px] font-medium text-safety">{err}</p>}

        {/* ---------- ปุ่มหลัก ---------- */}
        {mode === "register" && step === 1 ? (
          <button
            onClick={() => { if (canNext) { setStep(2); setErr(""); } }}
            disabled={!canNext}
            className="mt-6 w-full rounded-sm bg-safety py-3 text-[15px] font-semibold text-white disabled:bg-steel-600 disabled:text-ink-300"
          >
            ถัดไป
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            className="mt-6 w-full rounded-sm bg-safety py-3 text-[15px] font-semibold text-white disabled:bg-steel-600 disabled:text-ink-300"
          >
            {busy ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
          </button>
        )}

        {/* ---------- สลับโหมด ---------- */}
        <p className="mt-6 text-center text-[13px] text-ink-500">
          {mode === "login" ? (
            <>ยังไม่มีบัญชี? <Link href="/account/register/" className="font-medium text-safety">สมัครใหม่</Link></>
          ) : (
            <>มีบัญชีอยู่แล้ว? <Link href="/account/login/" className="font-medium text-safety">เข้าสู่ระบบ</Link></>
          )}
        </p>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-300">
          การสมัครถือว่ายอมรับเงื่อนไขการให้บริการ
          <br />และนโยบายความเป็นส่วนตัวของร้าน GUCUT
        </p>

        <p className="mt-6 text-center text-[12px] text-ink-300">
          ลืมรหัสผ่าน? <Link href="/account/" className="underline">ทักแชทหาร้านได้เลย</Link>
        </p>
      </div>
    </main>
  );
}
