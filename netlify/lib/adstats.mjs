// ค่าโฆษณาจากแต่ละเจ้า — ต่อ API ตรง ไม่ผ่านตัวกลางที่คิดเงินรายเดือน
//
// ทำไมไม่ใช้ Supermetrics: ทดลองใช้ฟรีหมดอายุ 8 ก.ค. 2569 และแพ็กเกจที่ให้ API
// ใช้ราคาหลักพันถึงหลักหมื่นต่อเดือน · ต่อเองได้ฟรีและได้ข้อมูลสดกว่า
//
// ⚠️ สิ่งที่เราทำได้ดีกว่าตัวกลางทุกเจ้า
//    เรามี "ยอดขายจริงจากออเดอร์ในระบบเราเอง" อยู่แล้ว
//    จึงเทียบ "ค่าโฆษณา vs เงินที่เข้าจริง" ได้ตรง ๆ ไม่ต้องเดาจากพิกเซล
//    (พิกเซลนับไม่ครบเพราะโดนตัวบล็อกโฆษณาและ iOS สกัด)
//
// ⚠️ โทเคนเก็บที่ Netlify Blobs ไม่ใช่ในโค้ด และไม่ส่งกลับหน้าเว็บเด็ดขาด
import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });
const KEY = "adstats";

const EMPTY = {
  fb: { on: false, accountId: "", token: "" },
  google: {
    on: false, customerId: "", loginCustomerId: "",
    developerToken: "", clientId: "", clientSecret: "", refreshToken: "",
  },
};

/** ค่าตั้งค่าทั้งหมด (มีโทเคน) — ใช้ฝั่งเซิร์ฟเวอร์เท่านั้น */
export async function readConfig() {
  try {
    const v = await store().get(KEY, { type: "json" });
    return {
      fb: { ...EMPTY.fb, ...(v?.fb || {}) },
      google: { ...EMPTY.google, ...(v?.google || {}) },
    };
  } catch {
    return EMPTY;
  }
}

/** บันทึกค่าตั้งค่า — โทเคนว่างแปลว่า "ไม่เปลี่ยน" ไม่ใช่ "ลบ" */
export async function saveConfig(input) {
  const cur = await readConfig();
  const fb = input?.fb || {};
  const g = input?.google || {};
  // ค่าลับที่ส่งมาว่าง = "ไม่เปลี่ยน" ไม่ใช่ "ลบ" — หน้าเว็บไม่เคยได้ค่าจริงไปแสดง
  const keep = (v, old, max = 500) => (v ? String(v).slice(0, max) : old);
  const next = {
    fb: {
      on: !!fb.on,
      accountId: String(fb.accountId ?? cur.fb.accountId).replace(/[^0-9]/g, "").slice(0, 32),
      token: keep(fb.token, cur.fb.token),
    },
    google: {
      on: !!g.on,
      customerId: String(g.customerId ?? cur.google.customerId).replace(/[^0-9]/g, "").slice(0, 32),
      loginCustomerId: String(g.loginCustomerId ?? cur.google.loginCustomerId).replace(/[^0-9]/g, "").slice(0, 32),
      developerToken: keep(g.developerToken, cur.google.developerToken, 200),
      clientId: keep(g.clientId, cur.google.clientId, 300),
      clientSecret: keep(g.clientSecret, cur.google.clientSecret, 200),
      refreshToken: keep(g.refreshToken, cur.google.refreshToken, 500),
    },
  };
  await store().setJSON(KEY, next);
  return next;
}

/** ส่งกลับหน้าเว็บได้ — ไม่มีโทเคนติดไป */
export const publicView = (c) => ({
  fb: { on: c.fb.on, accountId: c.fb.accountId, hasToken: !!c.fb.token },
  google: {
    on: c.google.on,
    customerId: c.google.customerId,
    loginCustomerId: c.google.loginCustomerId,
    hasDeveloperToken: !!c.google.developerToken,
    hasClientId: !!c.google.clientId,
    hasClientSecret: !!c.google.clientSecret,
    hasRefreshToken: !!c.google.refreshToken,
  },
});

// ---------------------------------------------------------------------------
// Facebook / Instagram Ads
//
// ใช้ Marketing API ตรง ๆ ด้วย "โทเคนของ System User" ที่เจ้าของร้านสร้างเอง
// ไม่ต้องทำ OAuth ให้ยุ่งยาก และโทเคนแบบนี้ไม่หมดอายุ
// ⚠️ ต้องให้สิทธิ์ ads_read กับบัญชีโฆษณาที่จะดู ไม่งั้น Facebook ตอบ 200 พร้อมลิสต์ว่าง
// ---------------------------------------------------------------------------
const FB = "https://graph.facebook.com/v21.0";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** ผลรวมค่าโฆษณาแยกตามแคมเปญ ในช่วงวันที่กำหนด */
export async function facebookInsights({ accountId, token, since, until }) {
  if (!accountId || !token) throw new Error("ยังไม่ได้ตั้งค่า Facebook Ads");

  const params = new URLSearchParams({
    access_token: token,
    level: "campaign",
    time_range: JSON.stringify({ since, until }),
    fields: "campaign_name,spend,impressions,clicks,actions,action_values",
    limit: "100",
  });

  const r = await fetch(`${FB}/act_${accountId}/insights?${params}`, {
    signal: AbortSignal.timeout(20000),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(body?.error?.message || `Facebook ตอบ ${r.status}`);
  }

  const rows = (body?.data || []).map((x) => {
    const find = (list, type) =>
      num((list || []).find((a) => a.action_type === type)?.value);
    return {
      name: x.campaign_name || "(ไม่มีชื่อ)",
      spend: num(x.spend),
      impressions: num(x.impressions),
      clicks: num(x.clicks),
      // Facebook เรียกการซื้อว่า purchase หรือ omni_purchase แล้วแต่การตั้งค่า
      purchases: find(x.actions, "purchase") || find(x.actions, "omni_purchase"),
      revenue: find(x.action_values, "purchase") || find(x.action_values, "omni_purchase"),
    };
  });

  rows.sort((a, b) => b.spend - a.spend);
  return rows;
}
