"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Portal from "./Portal";
import Price from "./Price";
import { SHELL_W } from "@/lib/layout";
import { addToCart } from "@/lib/cart";
import {
  คีย์อะไหล่, สภาพของอะไหล่, ซื้อได้, สรุปที่เลือก, อ่านของในร้าน, สรุปของท่อ,
  type PartGroup, type PartRow, type PartsDoc, type PartsModel,
  type ของในร้าน, type สภาพขาย, type สรุปจากท่อ,
} from "@/lib/parts";

// แผนผังอะไหล่ — ออกแบบให้ "นิ้วโป้งข้างเดียวบนมือถือ" ใช้จบ
//
// กติกาที่เจ้าของร้านสั่ง 11 ต.ค. 2569: **เน้นมือถือ 100%**
// ⚠️ สิ่งที่ตามมาจากกติกานั้น ห้ามแก้กลับโดยไม่คิด:
//  · จุดกดต้องไม่เล็กกว่า 40px ถึงนิ้วจะกดติด — เลขในภาพพิมพ์เล็กมาก
//    จุดกดจึงเป็นวงใสคลุมทับเลข ไม่ใช่ตัวเลขเอง
//  · คำตอบต้อง "เด้งขึ้นมาหานิ้ว" (แผ่นล่างจอ) ห้ามให้เลื่อนไปหาตารางเอง
//    นี่คือข้อที่เว็บอะไหล่เจ้าอื่นทำแล้วใช้ยากบนมือถือ
//  · ซูมเป็นปุ่มขั้นบันได ไม่ใช่ pinch — pinch ในหน้า PWA ถูกปิดด้วย viewport
//    และ gesture สองนิ้วบนภาพที่อยู่ในหน้าเลื่อนได้ทำให้หน้าเลื่อนมั่ว

type แมป = Record<string, string>;

const ซูม = [1, 1.8, 2.8] as const;

export default function PartsView({ doc, model }: { doc: PartsDoc; model: PartsModel }) {
  const [กลุ่มที่เลือก, setกลุ่ม] = useState(0);
  const [ระดับซูม, setซูม] = useState(0);
  const [เลือกอยู่, setเลือก] = useState<PartRow[] | null>(null);
  const [คำค้น, setคำค้น] = useState("");
  const [เน้น, setเน้น] = useState<string | null>(null);
  const [map, setMap] = useState<แมป>({});
  const [ของร้าน, setของร้าน] = useState<Record<string, ของในร้าน>>({});
  /** 🔑 สี่สถานะของ "การถามท่อ" — ไม่ใช่ boolean
   *  `ไม่ได้` ต้องไม่ถูกจอแปลว่า "ของหมด" (ดู สภาพของอะไหล่ ใน lib/parts.ts) */
  const [ท่อ, setท่อ] = useState<"ยังไม่ถาม" | "กำลังถาม" | "ได้แล้ว" | "ไม่ได้">("ยังไม่ถาม");
  /** ป้ายขอบเขตที่ท่อส่งมา — ตัดที่เท่าไหร่ · สต็อกเก่าไหม · อ่านไม่ได้ไหม */
  const [สรุปท่อ, setสรุปท่อ] = useState<สรุปจากท่อ | null>(null);
  const [เลือกซื้อ, setเลือกซื้อ] = useState<Record<string, number>>({});
  const [ใส่แล้ว, setใส่แล้ว] = useState(0);
  const กรอบ = useRef<HTMLDivElement>(null);

  const g: PartGroup | undefined = doc.กลุ่ม[กลุ่มที่เลือก];

  /* ป้ายชื่อกลุ่มที่โชว์บนปุ่ม
     🔑 เล่มที่ **เราจัดลำดับเอง** โชว์ชื่ออย่างเดียว (ห้ามให้ a,b,c ดูเหมือนรหัสของ STIHL)
     🔴 แต่ชื่อกลุ่มซ้ำกันได้จริง — MS382 มี "Tightening torques" **สองกลุ่ม** (สารบัญก็ลิสต์สองครั้ง)
        ⇒ ถ้าโชว์ชื่อเปล่า ๆ จะได้ปุ่มสองปุ่มที่อ่านเหมือนกันเป๊ะ แล้วคนกดไม่รู้ว่าต่างกันตรงไหน
        ⇒ เติมลำดับที่ซ้ำกำกับ (1) (2) — ไม่ใช่ตัวอักษรที่เราแต่ง */
  const ป้ายกลุ่ม = useMemo(() => {
    const นับ: Record<string, number> = {};
    const ทั้งหมด: Record<string, number> = {};
    for (const x of doc.กลุ่ม) ทั้งหมด[x.ชื่อ] = (ทั้งหมด[x.ชื่อ] ?? 0) + 1;
    return doc.กลุ่ม.map((x) => {
      if (!doc.ลำดับกลุ่มเราจัดเอง) return `${x.ตัวอักษร} · ${x.ชื่อ}`;
      if (ทั้งหมด[x.ชื่อ] === 1) return x.ชื่อ;
      นับ[x.ชื่อ] = (นับ[x.ชื่อ] ?? 0) + 1;
      return `${x.ชื่อ} (${นับ[x.ชื่อ]})`;
    });
  }, [doc]);

  // ── ตารางจับคู่ "รหัสอะไหล่ → รหัสสินค้าในร้าน" ที่เจ้าของร้านกรอกเอง
  //    ⚠️ ต้องพังไปทางปล่อยผ่าน: ดึงไม่ได้ = ถือว่ายังไม่จับคู่ ไม่ใช่หน้าเสีย
  useEffect(() => {
    let ยกเลิก = false;
    fetch(`/api/parts-map?model=${encodeURIComponent(doc.รหัสรุ่น)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!ยกเลิก && j && typeof j.map === "object" && j.map) setMap(j.map as แมป);
      })
      .catch(() => {});
    return () => {
      ยกเลิก = true;
    };
  }, [doc.รหัสรุ่น]);

  // ── ราคา/สต็อก/รูป ของอะไหล่ที่จับคู่แล้ว — **ถามครั้งเดียวต่อรุ่น**
  //    (ไม่ใช่ต่อกลุ่ม และไม่ใช่ต่อชิ้น · เหตุอยู่ใน lib/parts.ts)
  //    ⚠️ ถามไม่ได้ ⇒ `ท่อ: "ไม่ได้"` และจอต้องเขียนว่า "ยังอ่านราคาไม่ได้"
  //       ห้ามกลายเป็น "หมด" และห้ามเงียบ — ลูกค้าจะคิดว่าร้านไม่มีของ
  useEffect(() => {
    let ยกเลิก = false;
    setของร้าน({});
    setเลือกซื้อ({});
    setท่อ("กำลังถาม");
    fetch(`/api/parts-skus?model=${encodeURIComponent(doc.รหัสรุ่น)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (ยกเลิก) return;
        const ส = สรุปของท่อ(j);
        setสรุปท่อ(ส);
        setของร้าน(อ่านของในร้าน(j));
        /* 🔑 ท่อตอบ 200 แต่บอกเองว่าอ่านไม่ได้ ⇒ **ไม่ใช่ "ได้แล้ว"**
           ถ้านับเป็นได้แล้ว ทุกแถวจะขึ้น "สอบถามร้าน" = บอกลูกค้าว่าเรายังไม่ได้ลงขาย
           ทั้งที่ความจริงคือเราอ่านไม่ได้ตอนนี้ */
        setท่อ(ส.อ่านไม่ได้ ? "ไม่ได้" : "ได้แล้ว");
      })
      .catch(() => {
        if (!ยกเลิก) { setสรุปท่อ(null); setท่อ("ไม่ได้"); }
      });
    return () => {
      ยกเลิก = true;
    };
  }, [doc.รหัสรุ่น]);

  // แถบ "ใส่ตะกร้าแล้ว" ต้องหายเอง — มันทับการ์ดแถวล่างอยู่ ถ้าค้างไว้ก็บังของที่คนกำลังไล่อ่าน
  useEffect(() => {
    if (!ใส่แล้ว) return;
    const t = setTimeout(() => setใส่แล้ว(0), 6000);
    return () => clearTimeout(t);
  }, [ใส่แล้ว]);

  // ── ค้นหา: รหัสอะไหล่ หรือ ชื่ออังกฤษ · ค้นข้ามทุกกลุ่มของรุ่นนี้
  const ผลค้น = useMemo(() => {
    const q = คำค้น.trim().toLowerCase().replace(/\s+/g, "");
    if (q.length < 2) return [];
    const out: { g: number; row: PartRow }[] = [];
    doc.กลุ่ม.forEach((grp, gi) => {
      grp.อะไหล่.forEach((row) => {
        const ตรง =
          คีย์อะไหล่(row.รหัส).toLowerCase().includes(q) ||
          row.ชื่อ.toLowerCase().replace(/\s+/g, "").includes(q);
        if (ตรง) out.push({ g: gi, row });
      });
    });
    return out.slice(0, 40);
  }, [คำค้น, doc.กลุ่ม]);

  // ── อะไหล่ทุกชิ้นที่ใช้เลขนี้ (ชิ้นเดียวกันมีได้หลายรหัสให้เลือก)
  const เปิดเลข = useCallback(
    (เลข: string) => {
      if (!g) return;
      const rows = g.อะไหล่.filter((r) => r.เลข === เลข);
      setเลือก(rows.length ? rows : [{ เลข, รหัส: "", จำนวน: "", ชื่อ: "" }]);
    },
    [g],
  );

  /* ── 🔗 มาจากหน้าสินค้า: `?g=<ตัวอักษรกลุ่ม>&n=<เลขในผัง>` ──
     หน้าสินค้าส่งตำแหน่งมาให้ **เฉพาะตำแหน่งที่มันยืนยันแล้วว่ามีในคู่มือเล่มนี้**
     (ดู `ตรวจตำแหน่งในคู่มือ` ใน lib/parts-fits.mjs) — แต่ที่นี่ยังต้องตรวจซ้ำ
     เพราะลิงก์เป็นของที่ใครก็พิมพ์เองได้ และลิงก์เก่าค้างในแชท/บุ๊กมาร์กได้เสมอ

     ⚠️ **ต้องอ่านใน useEffect ห้ามอ่านตอนสร้าง state** — หน้านี้ถูก build เป็น HTML ล่วงหน้า
        ตอน build ไม่มี `window` ⇒ lazy initializer จะพังทั้งหน้า (กติกาเดียวกับหน้า QR ของ Beam)
     ⚠️ หาไม่เจอ = **ไม่ทำอะไรเลย** หน้าต้องเปิดได้ปกติ ไม่ใช่ 404 และไม่ใช่เด้งกลุ่มมั่ว
     🔑 วิ่งรอบเดียวต่อรุ่น (dep = doc.รหัสรุ่น) ไม่ผูกกับ `กลุ่มที่เลือก`
        ไม่งั้นลูกค้ากดเปลี่ยนกลุ่มแล้ว effect จะลากกลับมากลุ่มเดิมทุกครั้ง
        (คลาสเดียวกับบทเรียน "ปุ่มกรองเด้งกลับเพราะ effect โหลดทับ") */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let q: URLSearchParams;
    try {
      q = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const ตัวอักษร = (q.get("g") ?? "").trim().toUpperCase();
    const เลขที่ขอ = (q.get("n") ?? "").trim().toUpperCase();
    if (!ตัวอักษร) return;
    const gi = doc.กลุ่ม.findIndex((x) => String(x.ตัวอักษร ?? "").toUpperCase() === ตัวอักษร);
    if (gi < 0) return;
    setกลุ่ม(gi);
    if (!เลขที่ขอ) return;
    const rows = doc.กลุ่ม[gi].อะไหล่.filter((r) => String(r.เลข ?? "").toUpperCase() === เลขที่ขอ);
    // เลขที่ไม่มีในกลุ่มนี้ ⇒ อยู่กลุ่มที่ถูกแล้วก็พอ **ห้ามเปิดแผ่นเปล่า**
    if (!rows.length) return;
    setเน้น(rows[0].เลข);
    setเลือก(rows);
  }, [doc.รหัสรุ่น, doc.กลุ่ม]);

  // เปลี่ยนกลุ่มแล้วเลื่อนภาพกลับไปมุมซ้ายบน ไม่งั้นค้างอยู่ตำแหน่งเดิมของกลุ่มก่อน
  useEffect(() => {
    กรอบ.current?.scrollTo({ left: 0, top: 0 });
  }, [กลุ่มที่เลือก, ระดับซูม]);

  const สรุป = สรุปที่เลือก(เลือกซื้อ, ของร้าน);

  /** ใส่ของที่เลือกไว้ทั้งหมดลงตะกร้าทีเดียว
   *  ⚠️ ข้ามชิ้นที่ข้อมูลไม่พอ (ไม่มี handle/ราคา) และ **นับว่าข้ามไปกี่ชิ้น**
   *     ถ้าไม่นับ จอจะบอกว่าใส่ครบทั้งที่บางชิ้นหลุด = ข่าวดีปลอม */
  const ใส่ตะกร้าทั้งหมด = () => {
    let ใส่ = 0;
    for (const [คีย์, n] of Object.entries(เลือกซื้อ)) {
      const ของ = ของร้าน[คีย์];
      const สภาพ = สภาพของอะไหล่(ของ?.sku, ของ);
      if (!ซื้อได้(สภาพ, ของ) || !ของ || !ของ.handle || typeof ของ.price !== "number") continue;
      addToCart(
        {
          productId: ของ.id || ของ.handle,
          handle: ของ.handle,
          title: ของ.title || ของ.sku,
          variant: "-",
          price: ของ.price,
          image: ของ.image || "",
          sku: ของ.sku,
        },
        n,
      );
      ใส่ += n;
    }
    setใส่แล้ว(ใส่);
    setเลือกซื้อ({});
  };

  if (!g) return null;
  /* รับค่าว่างได้ — แถวที่คู่มือไม่ให้รหัสมาก็ต้องถามได้ว่า "จับคู่แล้วหรือยัง"
     คำตอบคือ "ยัง" (ไม่มีรหัสก็จับคู่ไม่ได้) ซึ่งถูกต้องตามความหมาย ไม่ใช่การกลบปัญหา */
  const จับคู่แล้ว = (รหัส: string | null | undefined) => map[คีย์อะไหล่(รหัส)];

  return (
    <div className={`mx-auto w-full ${SHELL_W} pb-24`}>
      {/* ── ช่องค้น: ปักบนสุด เพราะช่างที่รู้รหัสอยู่แล้วต้องจบใน 3 วินาที ── */}
      <div className="sticky top-0 z-20 bg-white px-3 pb-2 pt-3 shadow-[0_1px_0_0_#e5e5e5]">
        <div className="flex items-center gap-2">
          <Link
            href="/parts/"
            className="shrink-0 rounded-md border border-steel-600 px-2.5 py-2 text-[13px] font-semibold text-steel-300"
          >
            ← รุ่น
          </Link>
          <input
            value={คำค้น}
            onChange={(e) => setคำค้น(e.target.value)}
            inputMode="search"
            enterKeyHint="search"
            placeholder="ค้นรหัสอะไหล่ หรือชื่ออังกฤษ"
            aria-label="ค้นหาอะไหล่"
            className="min-w-0 flex-1 rounded-md border border-steel-600 px-3 py-2 text-[15px] outline-none focus:border-safety"
          />
          {คำค้น && (
            <button
              type="button"
              onClick={() => setคำค้น("")}
              aria-label="ล้างคำค้น"
              className="shrink-0 rounded-md border border-steel-600 px-2.5 py-2 text-[13px] text-steel-300"
            >
              ล้าง
            </button>
          )}
        </div>
        <p className="mt-1 text-[11.5px] text-steel-300">
          {doc.ชื่อรุ่น} · {doc.กลุ่ม.length} กลุ่ม ·{" "}
          {doc.กลุ่ม.reduce((n, x) => n + x.อะไหล่.length, 0).toLocaleString("th-TH")} รายการ
        </p>
      </div>

      {/* ── ผลค้น: ขึ้นทับแทนภาพ เพราะบนมือถือไม่มีที่ให้วางสองอย่างพร้อมกัน ── */}
      {ผลค้น.length > 0 && (
        <ul className="mx-3 mt-2 divide-y divide-steel-600 overflow-hidden rounded-lg border border-steel-600">
          {ผลค้น.map(({ g: gi, row }, i) => (
            <li key={`${gi}-${row.รหัส}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  setกลุ่ม(gi);
                  setคำค้น("");
                  setเน้น(row.เลข);
                  setเลือก(doc.กลุ่ม[gi].อะไหล่.filter((r) => r.เลข === row.เลข));
                }}
                className="flex w-full items-center gap-2 px-3 py-3 text-left active:bg-steel-100/60"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-steel-100 text-[12px] font-bold text-carbon">
                  {row.เลข}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-carbon">
                    {row.ชื่อ || "—"}
                  </span>
                  <span className="block text-[11.5px] tabular-nums text-steel-300">
                    {row.รหัส} · {doc.กลุ่ม[gi].ชื่อ}
                  </span>
                </span>
                {จับคู่แล้ว(row.รหัส) && (
                  <span className="shrink-0 rounded-sm bg-safety px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                    มีขาย
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {ผลค้น.length === 0 && (
        <>
          {/* ── เลือกกลุ่ม: แถบเลื่อนแนวนอน กดง่ายด้วยนิ้วโป้ง ── */}
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-3 pb-1">
            {doc.กลุ่ม.map((x, i) => (
              <button
                key={x.id}
                type="button"
                onClick={() => {
                  setกลุ่ม(i);
                  setเน้น(null);
                }}
                className={`shrink-0 rounded-full border px-3 py-2 text-[12.5px] font-semibold ${
                  i === กลุ่มที่เลือก
                    ? "border-safety bg-safety text-white"
                    : "border-steel-600 bg-white text-steel-300"
                }`}
              >
                {ป้ายกลุ่ม[i]}
              </button>
            ))}
          </div>

          {/* ── ภาพ + จุดกด ── */}
          <div className="mt-1 px-3">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="truncate text-[14px] font-bold text-carbon">{g.ชื่อ}</h2>
              <div className="flex shrink-0 gap-1">
                {ซูม.map((z, i) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setซูม(i)}
                    aria-label={`ซูม ${z} เท่า`}
                    className={`h-9 w-9 rounded-md border text-[12px] font-bold ${
                      i === ระดับซูม
                        ? "border-safety bg-safety text-white"
                        : "border-steel-600 bg-white text-steel-300"
                    }`}
                  >
                    {z}×
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={กรอบ}
              className="relative overflow-auto rounded-lg border border-steel-600 bg-white"
              style={{ maxHeight: "62vh", WebkitOverflowScrolling: "touch" }}
            >
              <div className="relative" style={{ width: `${ซูม[ระดับซูม] * 100}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ภาพลายเส้นขนาดคงที่ ไม่ต้องผ่าน loader ของ R2 */}
                <img
                  src={`/parts/${doc.รหัสรุ่น}/${g.ภาพ}`}
                  alt={`แผนผังอะไหล่ ${doc.ชื่อรุ่น} — ${g.ชื่อ}`}
                  width={g.w}
                  height={g.h}
                  className="block h-auto w-full select-none"
                  draggable={false}
                />
                {g.จุด.map((d, i) => {
                  const มี = g.อะไหล่.some((r) => r.เลข === d.เลข);
                  const ขาย = g.อะไหล่.some((r) => r.เลข === d.เลข && จับคู่แล้ว(r.รหัส));
                  return (
                    <button
                      key={`${d.เลข}-${i}`}
                      type="button"
                      onClick={() => เปิดเลข(d.เลข)}
                      aria-label={`อะไหล่หมายเลข ${d.เลข}`}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 active:scale-95 ${
                        ขาย
                          ? "border-safety bg-safety/15"
                          : มี
                            ? "border-carbon/45 bg-carbon/5"
                            : "border-steel-600/50 bg-transparent"
                      } ${เน้น === d.เลข ? "ring-4 ring-safety/40" : ""}`}
                      style={{
                        left: `${d.x * 100}%`,
                        top: `${d.y * 100}%`,
                        width: 40,
                        height: 40,
                      }}
                    />
                  );
                })}
              </div>
            </div>
            {/* 🔑 คำบรรยายใต้ภาพคือ **คำสัญญา** — บางเล่มไม่มีจุดกดเลย
                (เลขชี้ถูกพิมพ์เป็นลายเส้น ดึงเป็นข้อความไม่ได้ · ดู `จุดกดอ่านไม่ได้` ใน lib/parts.ts)
                ⇒ ถ้ายังเขียนว่า "แตะวงกลมบนภาพ" ทั้งที่ไม่มีวงให้แตะ
                  ลูกค้าจะนึกว่าจอเสียหรือมือถือตัวเองมีปัญหา แล้วไม่มีใครรายงาน
                ⇒ ไม่มีจุด ⇒ บอกตรง ๆ ว่าเล่มนี้ยังไม่มี แล้วชี้ไปทางที่ใช้ได้จริง (รายการข้างล่าง) */}
            {g.จุด.length > 0 ? (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-steel-300">
                แตะวงกลมบนภาพเพื่อดูอะไหล่ชิ้นนั้น · วง
                <span className="mx-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-safety align-middle" />
                คือชิ้นที่ร้านมีขาย
              </p>
            ) : (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-steel-300">
                รุ่นนี้ยังแตะเลขบนภาพไม่ได้ — {doc.จุดกดอ่านไม่ได้ ?? "คู่มือเล่มนี้ไม่มีเลขชี้ที่อ่านเป็นข้อความได้"}
                <br />
                ดูเลขในภาพแล้วเลื่อนหาเลขเดียวกันในรายการข้างล่าง หรือพิมพ์เลข/ชื่อในช่องค้นหาได้เลย
              </p>
            )}
          </div>

          {/* ── รายการทั้งกลุ่ม: **การ์ดต่อแถว ไม่ใช่ตาราง** ──────────────────
              เจ้าของร้านสั่ง 11 ต.ค. 2569 ว่าเน้นมือถือ 100% ⇒ ตาราง 7 คอลัมน์
              แบบเว็บอะไหล่ฝรั่งใช้บนมือถือไม่ได้ (ต้องเลื่อนแนวนอนอ่านทีละช่อง)
              ⚠️ ปุ่ม −/+ เป้ากด 44px ตามที่สั่ง — คนซื้ออะไหล่มือเปื้อนน้ำมัน */}
          {ท่อ === "ไม่ได้" && (
            /* 🔑 **เบาลงโดยตั้งใจ** (เจ้าของร้านสั่ง 12 ต.ค. 2569)
               ของเดิมเป็นกล่องสีแบรนด์ ⇒ ลูกค้าเปิดหน้ามาเจอ "คำเตือน" ก่อนเห็นของ
               ⇒ ข้อมูลยังต้องมีครบเหมือนเดิม (ห้ามซ่อน) แต่ **น้ำหนักสายตาต้องไม่มาก่อนสินค้า** */
            <p className="mx-3 mt-3 text-[11.5px] leading-relaxed text-steel-300">
              ยังอ่านราคากับสต็อกไม่ได้ตอนนี้ — ไม่ได้แปลว่าของหมด · กดชิ้นที่ต้องการเพื่อทักร้านถาม
            </p>
          )}

          {/* ── ป้ายขอบเขตจากท่อ ─────────────────────────────────────────────
              🔑 กฎของรีโปนี้: **ตัวเลขกับรายการที่มาคนละขอบเขต ต้องเขียนกำกับบนจอ**
                 (ของจริงที่เคยเจอ: ปุ่มหมวดบอก 462 ตัว แต่กรองจาก 200 แถวแรก)
              ⇒ ท่อส่ง `จับคู่แล้ว` กับ `ส่งมา` มาให้โดยเฉพาะเพื่อข้อนี้ — ไม่โชว์ = ทิ้งของที่เขาส่งมา */}
          {สรุปท่อ?.ตัดที่ != null && สรุปท่อ.จับคู่แล้ว != null && (
            <p className="mx-3 mt-2 rounded-md border border-steel-600 px-3 py-2 text-[11.5px] leading-relaxed text-carbon">
              ร้านจับคู่รหัสไว้ <b>{สรุปท่อ.จับคู่แล้ว.toLocaleString("th-TH")}</b> ชิ้น ·
              หน้านี้แสดงราคาได้ <b>{(สรุปท่อ.ส่งมา ?? 0).toLocaleString("th-TH")}</b> ชิ้น
              — ชิ้นที่เหลือยังดูได้ กดเพื่อทักร้านถามได้เลย
            </p>
          )}
          {สรุปท่อ?.สต็อกเก่า && (
            <p className="mx-3 mt-2 text-[11.5px] leading-relaxed text-steel-300">
              จำนวนที่เห็นมาจากข้อมูลที่เก็บไว้ก่อนหน้า อาจไม่ตรงกับของในร้านตอนนี้
            </p>
          )}
          {/* 🔴 กลุ่มที่ไม่มีอะไหล่เลย **ต้องบอกว่าทำไม** — ของเดิมโชว์รายการเปล่า
              ลูกค้ากดเข้ามาเจอหน้าว่าง ไม่มีคำอธิบายอะไรเลย (13 ต.ค. 2569 มี 15 กลุ่มแบบนี้)
              🚫 ห้ามแก้ด้วยการซ่อนกลุ่ม — รูปในกลุ่มนั้นมีของจริงในคู่มือ
                 ซ่อนแล้วลูกค้าหาของทั้งกลุ่มไม่เจอ และตัวเลข "กลุ่มว่าง 0" จะสวยขึ้นโดยที่ของแย่ลง */}
          {g.อะไหล่.length === 0 && (
            <p className="mx-3 mt-3 rounded-md border border-steel-600 bg-white px-3 py-3 text-[12.5px] leading-relaxed text-steel-300">
              {g.ไม่มีอะไหล่เพราะ ?? "กลุ่มนี้ยังไม่มีรายการอะไหล่"}
              <br />
              กดชิ้นที่ต้องการจากรูปด้านบนไม่ได้ในกลุ่มนี้ — ทักร้านพร้อมบอกชื่อกลุ่มได้เลย
            </p>
          )}
          <ul className="mx-3 mt-3 space-y-2">
            {g.อะไหล่.map((row, i) => (
              <li key={`${row.รหัส}-${i}`}>
                <การ์ดอะไหล่
                  row={row}
                  ชื่อรุ่น={doc.ชื่อรุ่น}
                  ของ={ของร้าน[คีย์อะไหล่(row.รหัส)]}
                  skuจับคู่={จับคู่แล้ว(row.รหัส)}
                  ท่อ={ท่อ}
                  จำนวน={เลือกซื้อ[คีย์อะไหล่(row.รหัส)] || 0}
                  onจำนวน={(n) =>
                    setเลือกซื้อ((ก) => {
                      const คีย์ = คีย์อะไหล่(row.รหัส);
                      const ถัดไป = { ...ก };
                      if (n > 0) ถัดไป[คีย์] = n;
                      else delete ถัดไป[คีย์];
                      return ถัดไป;
                    })
                  }
                  onเปิด={() => เปิดเลข(row.เลข)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── แถบลอยล่างจอแบบ Shopee ─────────────────────────────────────────
          🔴 เหตุที่ปุ่มใส่ตะกร้าอยู่ท้ายรายการเฉย ๆ ไม่ได้: F440 มี 368 แถว
             เลือกชิ้นที่ 7 แล้วต้องเลื่อนผ่านอีก 361 แถวไปกดปุ่ม = ไม่มีใครซื้อ
          ⚠️ bottom-[57px] เพราะเมนูล่าง (BottomNav) สูง 57px และ **ไม่ซ่อนตัวเองที่ /parts/**
             (มันซ่อนเฉพาะ /products/) ⇒ วางที่ bottom-0 จะถูกเมนูทับจนกดไม่ได้ */}
      {สรุป.ชิ้น > 0 && (
        <div
          className={`fixed inset-x-0 bottom-[57px] z-40 mx-auto ${SHELL_W} border-t border-steel-600 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(0,0,0,0.08)]`}
        >
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              {/* สองเลข ไม่ใช่เลขเดียว — "3 รายการ" กับ "12 ชิ้น" คนละความหมาย */}
              <p className="text-[12px] text-steel-300">
                เลือก {สรุป.รายการ} รายการ · {สรุป.ชิ้น} ชิ้น
              </p>
              <p className="text-[17px] font-extrabold leading-tight text-safety">
                <Price value={สรุป.เงิน} />
              </p>
            </div>
            <button
              type="button"
              onClick={() => setเลือกซื้อ({})}
              className="min-h-[44px] shrink-0 rounded-md border border-steel-600 px-3 text-[13px] text-steel-300"
            >
              ล้าง
            </button>
            <button
              type="button"
              onClick={ใส่ตะกร้าทั้งหมด}
              className="min-h-[44px] shrink-0 rounded-md bg-safety px-4 text-[15px] font-extrabold text-white shadow-[0_3px_0_0_#8f2100] active:translate-y-[2px] active:shadow-[0_1px_0_0_#8f2100]"
            >
              ใส่ตะกร้า
            </button>
          </div>
        </div>
      )}

      {/* ใส่ตะกร้าแล้วต้องมีอะไรบอก — ไม่งั้นคนกดซ้ำเพราะไม่รู้ว่าติดไหม */}
      {ใส่แล้ว > 0 && สรุป.ชิ้น === 0 && (
        <div className={`fixed inset-x-0 bottom-[57px] z-40 mx-auto ${SHELL_W} px-3 pb-2`}>
          <div className="flex items-center justify-between gap-2 rounded-md bg-carbon px-3 py-2.5 text-white">
            <span className="text-[13px]">ใส่ตะกร้าแล้ว {ใส่แล้ว} ชิ้น</span>
            <Link href="/cart/" className="rounded-md bg-white px-3 py-1.5 text-[13px] font-bold text-carbon">
              ดูตะกร้า
            </Link>
          </div>
        </div>
      )}

      {เลือกอยู่ && (
        <แผ่นอะไหล่
          rows={เลือกอยู่}
          รุ่น={model}
          map={map}
          onClose={() => setเลือก(null)}
        />
      )}
    </div>
  );
}

// ── แผ่นเด้งจากล่างจอ — คำตอบมาหานิ้ว ไม่ต้องเลื่อนไปหาตาราง ──────────────
function แผ่นอะไหล่({
  rows,
  รุ่น,
  map,
  onClose,
}: {
  rows: PartRow[];
  รุ่น: PartsModel;
  map: แมป;
  onClose: () => void;
}) {
  // ล็อกไม่ให้หน้าหลังเลื่อนตอนเปิดแผ่น (ท่าเดียวกับ VariantSheet)
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="ปิด"
          onClick={onClose}
          className="absolute inset-0 bg-black/45"
        />
        <div
          className={`relative mx-auto w-full ${SHELL_W} max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white pb-[max(16px,env(safe-area-inset-bottom))]`}
        >
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-steel-600 bg-white px-4 py-3">
            <span className="text-[15px] font-bold text-carbon">
              อะไหล่หมายเลข {rows[0]?.เลข}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-steel-600 px-3 py-1.5 text-[13px] text-steel-300"
            >
              ปิด
            </button>
          </div>

          {rows.map((row, i) => {
            const sku = map[คีย์อะไหล่(row.รหัส)];
            return (
              <div key={`${row.รหัส}-${i}`} className="border-b border-steel-600 px-4 py-3 last:border-0">
                <p className="text-[15px] font-semibold leading-snug text-carbon">
                  {row.ชื่อ || "ไม่มีชื่อในคู่มือ"}
                </p>
                <p className="mt-1 text-[13px] tabular-nums text-steel-300">
                  {/* ⚠️ ไม่มีรหัส **ต้องเขียนว่าไม่มี** ห้ามปล่อยขีดเดียวให้อ่านเหมือนช่องว่างธรรมดา
                      ช่างเอาไปสั่งของต่อ — "ไม่มีรหัส" กับ "ลืมใส่" คนละเรื่องกันสำหรับเขา */}
                  รหัสอะไหล่{" "}
                  <span className="font-semibold text-carbon">
                    {row.รหัส || "— คู่มือไม่ได้ให้รหัสแถวนี้"}
                  </span>
                  {row.จำนวน ? ` · ใช้ ${row.จำนวน} ตัว` : ""}
                </p>

                {sku ? (
                  <Link
                    href={`/search/?q=${encodeURIComponent(sku)}`}
                    className="mt-3 block rounded-md bg-safety py-3 text-center text-[15px] font-extrabold text-white shadow-[0_3px_0_0_#8f2100] active:translate-y-[2px] active:shadow-[0_1px_0_0_#8f2100]"
                  >
                    ดูสินค้า · สั่งซื้อ
                  </Link>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link
                      href={`/search/?q=${encodeURIComponent(รุ่น.คำค้นร้าน)}`}
                      className="rounded-md border border-steel-600 py-2.5 text-center text-[13.5px] font-semibold text-carbon"
                    >
                      ค้นในร้าน
                    </Link>
                    <Link
                      href={`/account/?chat=1&q=${encodeURIComponent(
                        `ขอสอบถามอะไหล่ ${รุ่น.ชื่อ} รหัส ${row.รหัส} ${row.ชื่อ}`,
                      )}`}
                      className="rounded-md bg-carbon py-2.5 text-center text-[13.5px] font-semibold text-white"
                    >
                      ทักร้านถามชิ้นนี้
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Portal>
  );
}

// ── การ์ดอะไหล่หนึ่งชิ้น ────────────────────────────────────────────────────
// ต้นแบบที่เจ้าของร้านส่งมา (lsengineers.co.uk) เป็นตารางเดสก์ท็อป 7 คอลัมน์
// ⚠️ ของเราทำเป็นการ์ด **โดยตั้งใจ** ไม่ใช่ลอกไม่ครบ — บนมือถือตารางนั้นต้องเลื่อน
//    แนวนอนอ่านทีละช่อง และท่านย้ำเรื่องหน้านี้มาตลอดว่าเน้นมือถือ 100%
//
// 🔑 **สีแบรนด์ใช้โทเคน `safety` (#c42d00) ไม่ใช่ #FF3C00 ที่เขียนในใบสั่ง**
//    #ff3c00 เป็นสีเดิมถึง 19 ส.ค. 2569 และถูกถอดออกเพราะวัดคอนทราสต์บนพื้นขาว
//    ได้ 3.56 (เกณฑ์ 4.5) ⇒ ราคา/ปุ่ม 29 จุดไม่ผ่าน · ดูเหตุเต็มใน tailwind.config.ts
//    ⇒ ถ้าใครสั่งให้กลับไปใช้ #ff3c00 ต้องแก้ที่จานสีกลางพร้อมเหตุ ไม่ใช่ฝังในไฟล์นี้
function การ์ดอะไหล่({
  row,
  ชื่อรุ่น,
  ของ,
  skuจับคู่,
  ท่อ,
  จำนวน,
  onจำนวน,
  onเปิด,
}: {
  row: PartRow;
  ชื่อรุ่น: string;
  ของ: ของในร้าน | undefined;
  skuจับคู่: string | undefined;
  ท่อ: "ยังไม่ถาม" | "กำลังถาม" | "ได้แล้ว" | "ไม่ได้";
  จำนวน: number;
  onจำนวน: (n: number) => void;
  onเปิด: () => void;
}) {
  const สภาพ: สภาพขาย = สภาพของอะไหล่(skuจับคู่, ของ);
  const กดซื้อได้ = ซื้อได้(สภาพ, ของ);
  const เพดาน = กดซื้อได้ && ของ && ของ.st !== null ? ของ.st : 0;

  // ป้ายกลมมีสีพื้น — อ่านเร็วกว่าไอคอน+ตัวหนังสือตอนไล่สายตา 368 แถว
  // ⚠️ ทุกป้ายมี **ตัวหนังสือ** ไม่ใช่สีเพียว ๆ (คนตาบอดสีต้องอ่านได้)
  const ป้าย: Record<สภาพขาย, { คำ: string; คลาส: string }> = {
    /* 🎨 ขัด UI 12 ต.ค. 2569 (ท่านประธานส่งภาพมาสั่ง "ออกแบบให้สวย ๆ")
       ของเดิมป้าย "มีสินค้า" เป็นสีแบรนด์เต็ม ⇒ การ์ดเดียวมีแดง 3 จุด (ป้าย·ราคา·ปุ่ม+)
       **แย่งกันเด่นจนไม่มีอะไรเด่น** และป้ายแดงอ่านเผิน ๆ เหมือนคำเตือน
       🔑 หลัก: สีแบรนด์เข้มสงวนให้ "ของที่อยากให้กด/ให้เห็น" = ราคา กับ ปุ่ม + เท่านั้น
          "มีสินค้า" เป็นเรื่องปกติ ⇒ ป้ายอ่อน (tint) พออ่านรู้ · "ของหมด" ต่างหากที่ต้องชัด */
    มีสินค้า: { คำ: "มีสินค้า", คลาส: "bg-safety-tint text-safety" },
    หมด: { คำ: "ของหมด", คลาส: "bg-carbon text-white" },
    /* 🔴 **เปลี่ยนคำ 12 ต.ค. 2569 — เจ้าของร้านสั่งเอง** ของเดิมเขียนว่า "ยังไม่ลงขาย"
       ⇒ ลูกค้าอ่านว่า **ร้านไม่ขายของชิ้นนี้** แล้วปิดหน้าไป
       ความจริงคือ *ร้านอาจมีของ แต่เรายังไม่ได้จับคู่รหัส* ⇒ เป็นเรื่องของเรา ไม่ใช่ของลูกค้า
       ⇒ คำที่ใช้ต้องชวนให้ถามต่อ ไม่ใช่ปิดประตู (คลาสเดียวกับ "ระบบถูก แต่สื่อสารผิด") */
    ยังไม่ได้จับคู่: { คำ: "สอบถามร้าน", คลาส: "border border-safety bg-white text-safety" },
    ยังอ่านไม่ได้: { คำ: "ยังอ่านราคาไม่ได้", คลาส: "border border-carbon bg-white text-carbon" },
  };
  const ติดป้าย = ท่อ === "กำลังถาม" && skuจับคู่
    ? { คำ: "กำลังเช็คสต็อก", คลาส: "border border-steel-600 bg-white text-steel-300" }
    : ป้าย[สภาพ];

  return (
    /* 🎨 ขีดสีแบรนด์ซ้ายมือ = แถวนี้ซื้อได้เลย — ตากวาด 368 แถวแล้วเจอของที่ซื้อได้ทันที
       (แถวที่ซื้อไม่ได้ไม่มีขีด เงียบ ๆ ไป ไม่ต้องแย่งความสนใจ) */
    <div
      className={`overflow-hidden rounded-xl border bg-white shadow-[0_1px_4px_rgba(26,26,26,0.06)] ${
        กดซื้อได้ ? "border-steel-700 border-l-[3px] border-l-safety" : "border-steel-700"
      }`}
    >
      <div className="flex gap-2.5 p-2.5">
        {/* รูปย่อจัตุรัส — lazy ตามค่าเริ่มต้นของ next/image (ห้ามใส่ priority ที่นี่
            เพราะรายการนี้ยาว 368 แถว ใส่แล้วจะแย่งเน็ตกับรูปที่ลูกค้าเห็นจริง) */}
        <button
          type="button"
          onClick={onเปิด}
          aria-label={`ดูอะไหล่หมายเลข ${row.เลข}`}
          className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md border border-steel-700 bg-white"
        >
          {ของ?.image ? (
            <Image src={ของ.image} alt={ของ.title || row.ชื่อ || row.รหัส || "อะไหล่"} fill sizes="72px" className="object-contain" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[20px] font-bold text-steel-300">
              {row.เลข}
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <button type="button" onClick={onเปิด} className="min-w-0 flex-1 text-left">
              <span className="block text-[13.5px] font-medium leading-snug text-carbon">
                <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-steel-900 align-middle text-[11px] font-bold text-carbon">
                  {row.เลข}
                </span>
                {ของ?.title || row.ชื่อ || "—"}
              </span>
              <span className="mt-0.5 block text-[11.5px] tabular-nums text-steel-300">
                {row.รหัส}
                {row.จำนวน ? ` · ใช้ ${row.จำนวน} ตัว` : ""}
              </span>
            </button>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${ติดป้าย.คลาส}`}>
              {ติดป้าย.คำ}
            </span>
          </div>

          {/* ── แถวล่างของการ์ด: ราคา · จำนวน ─────────────────────────────────
              🔑 **โครงต้องครบทุกช่องตั้งแต่ยังไม่มีข้อมูล** (เจ้าของร้านสั่ง 12 ต.ค. 2569)
                 ของเดิมทำกลับกัน: มีข้อมูลค่อยโผล่ช่อง ⇒ วันที่ยังจับคู่ 0 คู่
                 การ์ดยุบเหลือชื่อกับป้าย ⇒ ท่านเปิดดูแล้วบอกว่า **"ไม่เหมือน"** ต้นแบบ — ถูกแล้ว
              ⇒ ช่องที่ยังไม่มีข้อมูลใส่ `—` ไว้ **ไม่ใช่ซ่อนช่องทิ้ง**
                 พอจับคู่รหัสตัวแรก แถวนั้นจะเต็มเองโดยไม่ต้องแก้โค้ดอีก */}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {/* ราคาไทยไม่มีทศนิยม (Price ใช้ toLocaleString ของ th-TH)
                ⚠️ ไม่มีราคา **ห้ามพิมพ์ 0** — ใส่ `—` ตามกฎ "ไม่รู้ห้ามกลายเป็นศูนย์" */}
            {typeof ของ?.price === "number" ? (
              <span className="text-[17px] font-extrabold leading-none text-safety">
                <Price value={ของ.price} />
              </span>
            ) : (
              /* 🔴 **ผมเพิ่งเหยียบกฎของตัวเองในชั่วโมงเดียวกัน** (12 ต.ค. 2569)
                 ร่างแรกของช่องนี้ใช้ `text-steel-700` (#dcdcdc) บนพื้นขาว = **1.37:1**
                 ซึ่งคือโรคเดียวกับปุ่มที่ท่านแจ้งเมื่อเช้าเป๊ะ — จาง ๆ จนแทบมองไม่เห็น
                 ⇒ ไฟล์ที่เราเขียนขึ้นมา *เพื่อแก้* ปัญหาหนึ่ง คือที่ที่เราระวังน้อยที่สุด
                 ⇒ ใช้ `steel-300` (#6b6b6b · 5.74:1) และ **ไม่หนา** แทน
                    อ่านออกจริง แต่ยังเบากว่าราคาจริงซึ่งเป็นตัวหนาสีแบรนด์ */
              <span className="text-[15px] font-normal text-steel-300" title="ยังไม่รู้ราคาของชิ้นนี้">
                —
              </span>
            )}

            {กดซื้อได้ ? (
              /* 🎨 stepper เป็นแคปซูลเดียว ไม่ใช่สามชิ้นลอย ๆ (ขัด UI 12 ต.ค. 2569)
                 เป้ากดยัง ≥44px ตามเดิม · ปุ่ม + เป็นสีแบรนด์เต็ม — จุดเด่นจุดเดียวของฝั่งขวา */
              <div className="flex shrink-0 items-stretch overflow-hidden rounded-lg border border-steel-600">
                <button
                  type="button"
                  onClick={() => onจำนวน(Math.max(0, จำนวน - 1))}
                  disabled={จำนวน <= 0}
                  aria-label={`ลดจำนวน ${row.รหัส}`}
                  className="h-[44px] w-[42px] bg-white text-[20px] font-bold text-carbon active:bg-steel-900 disabled:text-steel-600"
                >
                  −
                </button>
                <span className="grid min-w-[40px] place-items-center border-x border-steel-600 bg-white text-[15px] font-bold tabular-nums text-carbon">
                  {จำนวน}
                </span>
                <button
                  type="button"
                  onClick={() => onจำนวน(Math.min(เพดาน, จำนวน + 1))}
                  disabled={จำนวน >= เพดาน}
                  aria-label={`เพิ่มจำนวน ${row.รหัส}`}
                  title={จำนวน >= เพดาน ? `มีของ ${เพดาน} ชิ้น` : undefined}
                  className="h-[44px] w-[42px] bg-safety text-[20px] font-bold text-white active:bg-safety-dark disabled:bg-white disabled:text-steel-600"
                >
                  +
                </button>
              </div>
            ) : (
              /* ── ช่องจำนวนตอนยังซื้อไม่ได้ — **โชว์โครงไว้ กดไม่ได้** ──────────
                 ซ่อนทิ้งแล้วแถวจะยุบ ⇒ หน้าตาไม่เหมือนต้นแบบ และคนไม่รู้ว่าปกติมีช่องนี้
                 ⚠️ สีของสภาพปิดใช้ **ตัวหนังสือเข้มบนเทาอ่อน** ไม่ใช่ขาวจาง ๆ
                    (ของจริง 12 ต.ค. 2569: ขาว + opacity 40% = 1.43:1 อ่านไม่ออก
                     ⇒ ปุ่มที่กดไม่ได้ ไม่ควรเป็นปุ่มที่อ่านไม่ได้) */
              /* 🎨 ขัด UI รอบสอง 12 ต.ค. 2569 — ท่านประธานดูหน้าจริงแล้วสั่ง "สวย ๆ"
                 ของเดิม: แถวที่ขายไม่ได้โชว์ stepper ปลอม **บวก** ปุ่มแดงเต็มความกว้างอีกแถว
                 ⇒ 263 จาก 368 แถวเป็นแบบนี้ ⇒ **หน้าเต็มไปด้วยสีแดงจนของที่ขายได้จริงจมหาย**
                    และการ์ดที่ขายไม่ได้ยัง **สูงกว่า** การ์ดที่ขายได้ — ผิดลำดับความสำคัญ
                 ⇒ ยุบสองอย่างเหลือปุ่มเดียว กะทัดรัด อยู่ตำแหน่งเดียวกับ stepper
                    โครงการ์ดยังครบทุกช่อง (รูป · ชื่อ · รหัส · ราคา · ปุ่ม) ไม่ได้ยุบหาย */
              <Link
                href={`/account/?chat=1&q=${encodeURIComponent(
                  `ขอสอบถามอะไหล่ ${ชื่อรุ่น} รหัส ${row.รหัส} ${row.ชื่อ}`,
                )}`}
                className="grid h-[44px] shrink-0 place-items-center rounded-lg border border-steel-600 px-3.5 text-[12.5px] font-bold text-carbon active:bg-steel-900"
              >
                ทักร้านถาม
              </Link>
            )}
          </div>

          {/* ℹ️ ปุ่มทักร้านย้ายไปอยู่แถวเดียวกับราคาแล้ว (ขัด UI รอบสอง 12 ต.ค. 2569)
              เจ้าของร้านสั่งไว้ว่าป้าย "สอบถามร้าน" ต้องมาคู่กับทางทักแชท — **ยังมีครบ**
              เปลี่ยนแค่ตำแหน่งกับน้ำหนักสี ไม่ได้เอาออก */}
        </div>
      </div>
    </div>
  );
}
