// หน้าร้านของชนิดสำหรับ `permit-label-core.mjs` — ตรรกะอยู่ในไฟล์ `.mjs` ไฟล์เดียว
// (เทสที่ Node รันตรง ๆ import `.ts` ไม่ได้บน Node 20 — ด่าน scripts/check-test-ts-imports.mjs)
// ท่าเดียวกับ `stock-state.ts` ↔ `stock-state-core.mjs`
import {
  ป้ายลซ2 as ป้ายลซ2Core,
  ตัวเลือกต้องขอลซ2 as ตัวเลือกต้องขอลซ2Core,
  สถานะป้ายของตัวเลือก as สถานะป้ายของตัวเลือกCore,
  ป้ายของสินค้า as ป้ายของสินค้าCore,
} from "./permit-label-core.mjs";
import type { Product, Variant } from "./types";

/** 【ต้องขอ ลซ.2 ก่อน】 — ข้อความเดียวของทั้งเว็บ ห้ามพิมพ์ซ้ำที่อื่น */
export const ป้ายลซ2: string = ป้ายลซ2Core as string;

export type สถานะป้าย = "ต้องขอ" | "ยกเว้น" | "ไม่เกี่ยว";
export type ขอบเขตป้าย = "ทุกตัวเลือก" | "บางตัวเลือก" | null;

export const สถานะป้ายของตัวเลือก = (x: {
  sku?: string | null;
  k?: string | null;
  h?: string | null;
}): สถานะป้าย => สถานะป้ายของตัวเลือกCore(x) as สถานะป้าย;

/** ตัวเลือกนี้ต้องขอ ลซ.2 ก่อนซื้อไหม — ใช้ในหน้าเลือกขนาด */
export const ตัวเลือกต้องขอลซ2 = (p: Product, v?: Variant | null): boolean =>
  ตัวเลือกต้องขอลซ2Core({ sku: p.sku, k: v?.k ?? p.sku, h: p.h }) as boolean;

/** สินค้าใบนี้ต้องติดป้ายไหม และครอบทุกตัวเลือกหรือบางตัวเลือก */
export const ป้ายของสินค้า = (p: Product): ขอบเขตป้าย => ป้ายของสินค้าCore(p) as ขอบเขตป้าย;
