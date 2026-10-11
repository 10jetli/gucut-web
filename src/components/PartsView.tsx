"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Portal from "./Portal";
import { SHELL_W } from "@/lib/layout";
import { คีย์อะไหล่, type PartGroup, type PartRow, type PartsDoc, type PartsModel } from "@/lib/parts";

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
  const กรอบ = useRef<HTMLDivElement>(null);

  const g: PartGroup | undefined = doc.กลุ่ม[กลุ่มที่เลือก];

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

  // เปลี่ยนกลุ่มแล้วเลื่อนภาพกลับไปมุมซ้ายบน ไม่งั้นค้างอยู่ตำแหน่งเดิมของกลุ่มก่อน
  useEffect(() => {
    กรอบ.current?.scrollTo({ left: 0, top: 0 });
  }, [กลุ่มที่เลือก, ระดับซูม]);

  if (!g) return null;
  const จับคู่แล้ว = (รหัส: string) => map[คีย์อะไหล่(รหัส)];

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
                {x.ตัวอักษร} · {x.ชื่อ}
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
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-steel-300">
              แตะวงกลมบนภาพเพื่อดูอะไหล่ชิ้นนั้น · วง
              <span className="mx-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-safety align-middle" />
              คือชิ้นที่ร้านมีขาย
            </p>
          </div>

          {/* ── รายการทั้งกลุ่ม: สำหรับคนที่อยากไล่อ่านมากกว่าจิ้มภาพ ── */}
          <ul className="mx-3 mt-3 divide-y divide-steel-600 overflow-hidden rounded-lg border border-steel-600">
            {g.อะไหล่.map((row, i) => (
              <li key={`${row.รหัส}-${i}`}>
                <button
                  type="button"
                  onClick={() => เปิดเลข(row.เลข)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-steel-100/60"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-steel-100 text-[12px] font-bold text-carbon">
                    {row.เลข}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-carbon">{row.ชื่อ || "—"}</span>
                    <span className="block text-[11.5px] tabular-nums text-steel-300">{row.รหัส}</span>
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
        </>
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
                  รหัสอะไหล่ <span className="font-semibold text-carbon">{row.รหัส || "—"}</span>
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
