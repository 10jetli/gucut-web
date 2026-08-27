"use client";

// ตะกร้าสินค้าเก็บใน localStorage (Phase 1)
// ทุกครั้งที่เปลี่ยนแปลงจะยิง event "cart-updated" ให้ badge/หน้าตะกร้า refresh

export interface CartItem {
  productId: string;
  handle: string;
  title: string;
  variant: string;
  price: number;
  image: string;
  qty: number;
  sku?: string;   // SKU ของตัวเลือกที่หยิบ — ออเดอร์ใช้ส่งเข้า ZORT ให้ตัดสต็อกถูกตัว
}

const KEY = "gucut-cart";

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("cart-updated"));
  syncForReminder(items);
}

// ส่งสำเนาตะกร้าย่อ ๆ ให้ร้าน — ใช้กับระบบทวงตะกร้า (แจ้งเฉพาะลูกค้าที่ล็อกอิน)
// หน่วง 2 วิ: กดบวกรัว ๆ 5 ครั้ง = ส่งครั้งเดียว · พลาดก็เงียบ ไม่กระทบการซื้อ
let syncTimer: ReturnType<typeof setTimeout> | undefined;
function syncForReminder(items: CartItem[]) {
  try {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      const body = JSON.stringify({
        items: items.map((i) => ({ t: i.title, q: i.qty, p: i.price })),
        total: items.reduce((sum, i) => sum + i.price * i.qty, 0),
      });
      void fetch("/api/cart-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
        credentials: "include",
      }).catch(() => { /* ไม่ล็อกอิน/เน็ตสะดุด — ช่างมัน */ });
    }, 2000);
  } catch { /* ห้ามให้ตัวทวงทำตะกร้าพัง */ }
}

export function addToCart(item: Omit<CartItem, "qty">, qty = 1) {
  const items = getCart();
  const found = items.find(
    (i) => i.productId === item.productId && i.variant === item.variant
  );
  if (found) found.qty += qty;
  else items.push({ ...item, qty });
  save(items);
}

export function updateQty(productId: string, variant: string, qty: number) {
  let items = getCart();
  items = items
    .map((i) => (i.productId === productId && i.variant === variant ? { ...i, qty } : i))
    .filter((i) => i.qty > 0);
  save(items);
}

export function removeItem(productId: string, variant: string) {
  save(getCart().filter((i) => !(i.productId === productId && i.variant === variant)));
}

export function cartCount(): number {
  return getCart().reduce((s, i) => s + i.qty, 0);
}

export function cartTotal(): number {
  return getCart().reduce((s, i) => s + i.price * i.qty, 0);
}

// ---------------------------------------------------------------------------
// "ซื้อเลย" แบบ Shopee — ซื้อเฉพาะชิ้นที่กด ไม่ยุ่งกับของในตะกร้า
//
// เก็บที่ sessionStorage ไม่ใช่ localStorage ตั้งใจให้เป็นของชั่วคราวประจำแท็บ
// ปิดแท็บแล้วหายไปเอง จะได้ไม่มีของค้างมาโผล่ในการสั่งซื้อรอบหน้า
// ตะกร้า (localStorage) ไม่ถูกแตะเลยทั้งตอนกดซื้อและตอนสั่งสำเร็จ
// ---------------------------------------------------------------------------
const BUY_KEY = "gucut-buynow";

export function setBuyNow(item: Omit<CartItem, "qty">, qty = 1) {
  sessionStorage.setItem(BUY_KEY, JSON.stringify({ ...item, qty }));
}

export function getBuyNow(): CartItem | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(BUY_KEY);
    const it = raw ? (JSON.parse(raw) as CartItem) : null;
    return it && it.qty > 0 ? it : null;
  } catch {
    return null;
  }
}

export function setBuyNowQty(qty: number) {
  const it = getBuyNow();
  if (!it) return;
  if (qty > 0) sessionStorage.setItem(BUY_KEY, JSON.stringify({ ...it, qty }));
  else clearBuyNow();
}

export function clearBuyNow() {
  if (typeof window !== "undefined") sessionStorage.removeItem(BUY_KEY);
}
