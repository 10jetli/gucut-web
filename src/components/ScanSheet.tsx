"use client";

// แสกนภาพหาสินค้า — เปิดกล้อง กดชัตเตอร์ แล้วหาสินค้าที่หน้าตาใกล้เคียงที่สุด
//
// รูปไม่ออกจากเครื่องลูกค้าเลย การเทียบทำในเบราว์เซอร์ทั้งหมด (ดู src/lib/imgsearch.ts)
//
// ⚠️ เว็บอ่านคลังภาพของลูกค้ามาโชว์เป็นตารางเองไม่ได้ (เบราว์เซอร์ห้ามไว้ ต้องเป็นแอปติดตั้ง)
//    ปุ่ม "เลือกจากคลังภาพ" จึงเปิดตัวเลือกรูปของเครื่องแทน — ผลลัพธ์เหมือนกัน แค่คนละหน้าตา
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Price from "./Price";
import Stars from "./Stars";
import { compactCount } from "@/lib/types";
import { findByImage, prepare, type Hit } from "@/lib/imgsearch";

type Stage = "camera" | "working" | "result";

export default function ScanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("camera");
  const [step, setStep] = useState("");
  const [error, setError] = useState("");
  const [shot, setShot] = useState<string>("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // เปิดกล้อง (และปิดให้เรียบร้อยตอนออก ไม่งั้นไฟกล้องค้าง)
  useEffect(() => {
    if (!open || stage !== "camera") return;
    let dead = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 } },
          audio: false,
        });
        if (dead) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        // ไม่ให้สิทธิ์กล้อง หรือเครื่องไม่มีกล้อง → ยังเลือกรูปจากเครื่องได้
        if (!dead) setError("เปิดกล้องไม่ได้ — เลือกรูปจากคลังภาพแทนได้ครับ");
      }
    })();
    return () => {
      dead = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, stage, facing]);

  // เริ่มโหลดตัวคิดตั้งแต่เปิดกล้อง ลูกค้าเล็งกล้องอยู่พอดี กดแล้วได้ผลไว
  useEffect(() => {
    if (open) prepare().catch(() => {});
  }, [open]);

  const reset = useCallback(() => {
    setStage("camera");
    setHits([]);
    setShot("");
    setError("");
    setStep("");
  }, []);

  const close = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    reset();
    onClose();
  }, [onClose, reset]);

  async function run(src: CanvasImageSource, preview: string) {
    setShot(preview);
    setStage("working");
    setError("");
    try {
      const r = await findByImage(src, setStep);
      setHits(r);
      setStage("result");
    } catch (e) {
      // โชว์สาเหตุจริงออกมาเลย — เครื่องลูกค้าแต่ละรุ่นพังคนละจุด
      // ถ้าเก็บเงียบไว้จะไล่หาสาเหตุไม่ได้ (เจอมาแล้วบน Safari iPhone)
      setError(e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ");
      setStage("result");
    }
  }

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const cv = document.createElement("canvas");
    cv.width = v.videoWidth;
    cv.height = v.videoHeight;
    cv.getContext("2d")!.drawImage(v, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    run(cv, cv.toDataURL("image/jpeg", 0.8));
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new window.Image();
    img.onload = () => run(img, url);
    img.onerror = () => setError("เปิดรูปนี้ไม่ได้");
    img.src = url;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      {/* แถบบน */}
      <div className="flex shrink-0 items-center justify-between px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] text-white">
        <button onClick={close} aria-label="ปิด" className="p-2 text-2xl leading-none">
          ×
        </button>
        <span className="text-[14px] font-semibold">แสกนภาพหาสินค้า</span>
        {stage === "camera" ? (
          <button
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            aria-label="สลับกล้องหน้า/หลัง"
            className="p-2"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-white stroke-[1.8]">
              <path d="M4 9h3l1.5-2h7L17 9h3v10H4z" strokeLinejoin="round" />
              <path d="M14.5 14a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0" />
              <path d="M13 11.2l1.6-1.2M11 16.8l-1.6 1.2" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <button onClick={reset} className="p-2 text-[13px]">
            ถ่ายใหม่
          </button>
        )}
      </div>

      {/* ภาพกล้อง / รูปที่ถ่ายไว้ */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {stage === "camera" ? (
          <video
            ref={videoRef}
            playsInline
            muted
            className={
              "h-full w-full object-cover " + (facing === "user" ? "-scale-x-100" : "")
            }
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot} alt="รูปที่ใช้ค้นหา" className="h-full w-full object-contain" />
        )}

        {stage === "camera" && (
          <p className="absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-black/55 px-4 py-2 text-[13px] text-white">
            เล็งให้เห็นของชิ้นเดียวเต็ม ๆ แล้วกดปุ่ม
          </p>
        )}
        {stage === "working" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-safety" />
            <p className="text-[13px]">{step || "กำลังค้นหา..."}</p>
            <p className="max-w-[15rem] text-center text-[11px] text-white/60">
              ครั้งแรกโหลดตัวค้นหาประมาณ 7 MB ครั้งต่อไปจะเร็วขึ้นมาก
            </p>
          </div>
        )}
      </div>

      {/* แถบล่าง */}
      {stage === "camera" && (
        <div className="shrink-0 bg-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {error && <p className="mb-3 text-center text-[12px] text-white/80">{error}</p>}
          <div className="flex items-center justify-between">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-24 flex-col items-center gap-1 text-[11px] text-white/85"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-white stroke-[1.6]">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 16l4.5-4.5 3.5 3.5 3-3L21 16" strokeLinejoin="round" />
                <circle cx="8.5" cy="9.5" r="1.2" />
              </svg>
              เลือกจากคลังภาพ
            </button>
            <button
              onClick={shoot}
              aria-label="ถ่ายรูปเพื่อค้นหา"
              className="h-[70px] w-[70px] rounded-full border-[3px] border-white bg-white/25 active:scale-95"
            >
              <span className="mx-auto block h-[54px] w-[54px] rounded-full bg-white" />
            </button>
            <span className="w-24" />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={pick}
            className="hidden"
          />
        </div>
      )}

      {/* ผลลัพธ์ */}
      {stage === "result" && (
        <div className="max-h-[58%] shrink-0 overflow-y-auto rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="sticky top-0 z-10 border-b border-steel-700 bg-white px-3 py-2.5">
            <p className="text-[14px] font-semibold text-[#1a1a1a]">
              {error ? "ค้นหาไม่สำเร็จ" : hits.length ? `น่าจะเป็นตัวนี้ (${hits.length})` : "ไม่เจอตัวที่ใกล้เคียง"}
            </p>
            <p className={"mt-0.5 text-[11px] " + (error ? "break-words text-safety" : "text-steel-300")}>
              {error
                ? error
                : hits.length
                  ? "เรียงจากเหมือนที่สุด — ของที่หน้าตาคล้ายกันมาก (สกรู น็อต สปริง) อาจเดาผิดได้"
                  : "ลองถ่ายใกล้ขึ้น ให้เห็นของชิ้นเดียวเต็มกรอบ พื้นหลังโล่ง ๆ"}
            </p>
          </div>

          {hits.length > 0 && (
            <div className="grid grid-cols-3 gap-2 p-3">
              {hits.map((x) => (
                <Link
                  key={x.h}
                  href={`/products/${encodeURIComponent(x.h)}`}
                  onClick={close}
                  className="overflow-hidden rounded-sm border border-steel-700 bg-white"
                >
                  <div className="relative aspect-square overflow-hidden bg-white">
                    {x.i && (
                      <Image src={x.i} alt={x.t} fill sizes="33vw" className="object-contain" />
                    )}
                    <span className="absolute left-0 top-0 rounded-br bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white">
                      {Math.round(x.score * 100)}%
                    </span>
                  </div>
                  <div className="p-1.5">
                    <p className="clamp-2 min-h-8 text-[11px] leading-4 text-[#1a1a1a]">{x.t}</p>
                    <Price value={x.p} className="text-[12px] font-semibold text-safety" />
                    {x.r && (
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-steel-300">
                        <Stars value={x.r[0]} size={10} count={1} />
                        {x.r[0].toFixed(1)}
                        <span className="text-steel-600">|</span>
                        {compactCount(x.r[1])} รีวิว
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* ทางออกเสมอ — เดาผิดก็ยังถามร้านได้ */}
          <div className="px-3 pb-3">
            <button
              onClick={reset}
              className="w-full rounded-sm border border-safety py-2.5 text-[13px] font-semibold text-safety"
            >
              ถ่ายใหม่อีกครั้ง
            </button>
            <p className="mt-2 text-center text-[12px] text-steel-300">
              ไม่ใช่สักตัว?{" "}
              <Link href="/account/" onClick={close} className="font-semibold text-safety">
                ทักร้านให้ช่วยหา
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
