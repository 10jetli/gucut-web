// ตรวจสุขภาพ SEO / GEO / AEO ของเว็บตัวเอง — ใช้ได้เฉพาะฝั่ง server
//
// คิดตอน build จากข้อมูลจริงในโปรเจกต์ (แคตตาล็อก · บทความ · คลิป · ไฟล์รูป)
// ไม่ได้ไปยิงเครื่องมือข้างนอกให้เสียเงินรายเดือน — ของที่ตรวจได้เองก็ตรวจเอง
//
// ตัวนี้ทำแทนแอปที่เคยจ่ายรายเดือนบน Shopify สองตัว
//   SearchPie SEO & Speed  ($39/เดือน) — ตรวจ meta · ลิงก์เสีย · เนื้อหาซ้ำ · ความเร็ว
//   Vizby AI               ($29/เดือน) — ความพร้อมให้ AI หยิบไปตอบ + agents.md + บอต AI
// รวมกันปีละ ~29,000 บาท ที่ไม่ต้องจ่ายแล้ว
//
// หลักคิด: บอกเป็น "งานที่ต้องทำ" ไม่ใช่คะแนนลอย ๆ
// ทุกข้อต้องตอบได้ว่า "แก้แล้วได้อะไร" ไม่งั้นก็แค่ตัวเลขให้ดูเล่น
import fs from "node:fs";
import path from "node:path";
import { articles } from "./articles";
import { collections, inCollection, products, sellable } from "./catalog";
import stillClips from "@/data/still-clips.json";
import { videos } from "./videos";

export type Level = "high" | "mid" | "low" | "ok";

/** สามด้านที่ตรวจ — แยกแท็บในหน้าหลังร้าน */
export type Cat = "seo" | "geo" | "speed";

export interface Finding {
  cat: Cat;
  level: Level;
  title: string;       // ปัญหาคืออะไร
  count: number;       // กระทบกี่รายการ
  unit?: string;       // หน่วยของ count (ค่าเริ่มต้น "รายการ")
  why: string;         // แก้แล้วได้อะไร
  how: string;         // แก้ยังไง / ใครแก้
  sample?: string[];   // ตัวอย่างที่เจอ
}

const TITLE_MAX = 60;      // ยาวกว่านี้ Google ตัดท้ายทิ้งในผลค้นหา
const THIN_ARTICLE = 800;  // บทความสั้นกว่านี้ถือว่าเนื้อหาบาง
const BIG_IMG = 250 * 1024; // รูปใหญ่กว่านี้ถ่วงหน้าเว็บชัดเจนบนมือถือ

// คำที่บอกว่าหัวข้อนั้นเขียนเป็น "คำถาม" ซึ่งเป็นรูปแบบที่ผู้ช่วย AI หยิบไปตอบง่ายที่สุด
const QUESTION = /[?？]|ไหม|หรือไม่|อะไร|ยังไง|อย่างไร|ทำไม|เท่าไห?ร่|กี่|เมื่อไห?ร่|ที่ไหน|แบบไหน|ตัวไหน|รุ่นไหน/;

const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * ไล่นับขนาด "ไฟล์รูป" ในโฟลเดอร์ public — ใช้ตอน build เท่านั้น
 *
 * ⚠️ ต้องกรองด้วยนามสกุลรูปเสมอ — public/rv/ มีแต่ไฟล์ .json ของข้อมูลรีวิว
 *    เคยนับรวมมาแล้วครั้งหนึ่ง ทำให้ตัวเลข "ไฟล์รูปทั้งหมด" เพี้ยน
 */
const IMG_EXT = /\.(webp|avif|jpe?g|png|gif|svg)$/i;

function scanImages(dir: string) {
  const root = path.join(process.cwd(), "public", dir);
  const out = { n: 0, big: [] as string[], legacy: 0, bytes: 0 };
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return out; // ไม่มีโฟลเดอร์ก็ข้ามไป ไม่ใช่เรื่องผิดพลาด
  }
  for (const name of names) {
    if (!IMG_EXT.test(name)) continue;
    let st: fs.Stats;
    try {
      st = fs.statSync(path.join(root, name));
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    out.n++;
    out.bytes += st.size;
    if (st.size > BIG_IMG) out.big.push(`${dir}/${name} (${Math.round(st.size / 1024)}KB)`);
    if (/\.(jpe?g|png)$/i.test(name)) out.legacy++;
  }
  return out;
}

/** ไฟล์ที่ผู้ช่วย AI อ่าน — โชว์สถานะในหลังร้าน */
export interface AiFile {
  path: string;
  label: string;
  what: string;
  kb: number;      // 0 = ยังไม่มีไฟล์
}

export interface AuditResult {
  files: AiFile[];
  findings: Finding[];
  scores: Record<Cat, number>;
  score: number;
  stats: Record<string, number>;
  crawlable: boolean;
}

export function audit(): AuditResult {
  const sell = products.filter(sellable);
  const still = new Set(stillClips as string[]);

  // ---- สินค้า -------------------------------------------------------------
  const noDesc = sell.filter((p) => !p.d || p.d.trim().length < 40);
  const longTitle = sell.filter((p) => p.t.length > TITLE_MAX);
  const noSku = sell.filter((p) => !p.sku);
  const noReview = sell.filter((p) => !p.rv);
  const orphan = sell.filter((p) => !p.cols.length);

  // ชื่อซ้ำ — Google เลือกโชว์แค่หน้าเดียวจากชุดที่ชื่อเหมือนกัน ที่เหลือถูกกลบ
  const byTitle = new Map<string, string[]>();
  for (const p of sell) {
    const k = p.t.trim().toLowerCase();
    if (!byTitle.has(k)) byTitle.set(k, []);
    byTitle.get(k)!.push(p.t);
  }
  const dupTitle = [...byTitle.values()].filter((v) => v.length > 1);
  const dupTitleCount = dupTitle.reduce((s, v) => s + v.length, 0);

  // คำอธิบายซ้ำคำต่อคำ — นับเฉพาะอันที่ยาวพอจะถือว่าเป็นเนื้อหาจริง
  const byDesc = new Map<string, number>();
  for (const p of sell) {
    const d = (p.d || "").trim();
    if (d.length < 40) continue;
    byDesc.set(d, (byDesc.get(d) || 0) + 1);
  }
  const dupDesc = [...byDesc.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0);

  // สินค้าที่ AI อ่านแล้วยังตอบแทนร้านไม่ได้ — ไม่มีทั้งตัวเลือกและคำอธิบายที่ยาวพอ
  const noSpec = sell.filter((p) => p.v.length < 2 && (p.d || "").length < 120);

  // ---- บทความ -------------------------------------------------------------
  const thinArticles = articles.filter((a) => strip(a.body).length < THIN_ARTICLE);
  const noExcerpt = articles.filter((a) => !a.d || a.d.length < 50);
  const noArticleImg = articles.filter((a) => !a.img);

  // ลิงก์ในบทความที่ชี้ไปหน้าที่ไม่มีอยู่จริง (ของที่ SearchPie เรียกว่า broken link)
  const handles = {
    products: new Set(products.map((p) => p.h)),
    collections: new Set(collections.map((c) => c.h)),
    articles: new Set(articles.map((a) => a.h)),
  };
  const dead = new Map<string, number>();
  let noProductLink = 0;
  for (const a of articles) {
    let hasProductLink = false;
    for (const m of a.body.matchAll(/href="([^"]+)"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|tel:|#)/i.test(href)) continue; // ลิงก์ออกนอกเว็บ ไม่ตรวจ
      const seg = href.split("?")[0].split("/").filter(Boolean);
      const kind = seg[0] as keyof typeof handles;
      if (!(kind in handles)) continue;
      if (kind === "products") hasProductLink = true;
      let slug = seg[1] || "";
      try { slug = decodeURIComponent(slug); } catch { /* ลิงก์เพี้ยน ใช้ตามที่เห็น */ }
      if (!handles[kind].has(slug)) dead.set(href, (dead.get(href) || 0) + 1);
    }
    if (!hasProductLink) noProductLink++;
  }

  // หัวข้อย่อยที่ยังไม่ได้เขียนเป็นคำถาม — หัวใจของ AEO
  let heads = 0;
  let headQ = 0;
  const headSample: string[] = [];
  for (const a of articles) {
    for (const m of a.body.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)) {
      const t = strip(m[1]);
      if (!t) continue;
      heads++;
      if (QUESTION.test(t)) headQ++;
      else if (headSample.length < 3) headSample.push(t);
    }
  }

  // ---- คลิป ---------------------------------------------------------------
  const feedClips = videos.filter((v) => !still.has(v.v));
  const clipsNoProduct = feedClips.filter((v) => !v.h);

  // ---- ไฟล์รูป (ด้านความเร็ว) ---------------------------------------------
  const dirs = ["img", "rv-img", "art"].map(scanImages);
  const bigImgs = dirs.flatMap((d) => d.big);
  const legacy = dirs.reduce((s2, d) => s2 + d.legacy, 0);
  const imgTotal = dirs.reduce((s2, d) => s2 + d.n, 0);
  const imgBytes = dirs.reduce((s2, d) => s2 + d.bytes, 0);

  // ---- ไฟล์สำหรับผู้ช่วย AI ------------------------------------------------
  const sizeKb = (f: string) => {
    try {
      return Math.round(fs.statSync(path.join(process.cwd(), "public", f)).size / 1024);
    } catch {
      return 0;
    }
  };
  const files: AiFile[] = [
    { path: "/llms.txt", label: "llms.txt", what: "สารบัญย่อ บอกว่าร้านมีอะไรอยู่ที่ไหน", kb: sizeKb("llms.txt") },
    { path: "/llms-full.txt", label: "llms-full.txt", what: "เนื้อหาทั้งร้านในไฟล์เดียว สินค้าทุกตัว บทความ คำถามที่พบบ่อย", kb: sizeKb("llms-full.txt") },
    { path: "/agents.md", label: "agents.md", what: "กติกาสำหรับตัวแทนซื้อของอัตโนมัติ", kb: sizeKb("agents.md") },
  ];
  const hasAgents = files[2].kb > 0;
  const hasLlms = files[0].kb > 0;
  const hasFull = files[1].kb > 0;
  const crawlable = (() => {
    try {
      const txt = fs.readFileSync(path.join(process.cwd(), "public", "robots.txt"), "utf8");
      return !/^\s*Disallow:\s*\/\s*$/im.test(txt);
    } catch {
      return false;
    }
  })();

  const all: Finding[] = [
    // ===================== SEO ============================================
    {
      cat: "seo", level: "high",
      title: "สินค้ายังไม่มีคำอธิบาย",
      count: noDesc.length,
      why: "Google กับผู้ช่วย AI อ่านคำอธิบายเพื่อรู้ว่าสินค้านี้คืออะไร ใช้กับรุ่นไหน — ไม่มีคำอธิบายคือแทบไม่มีโอกาสถูกหยิบไปตอบ และหน้าจะสู้คู่แข่งไม่ได้",
      how: "เขียนสั้น ๆ 2-3 บรรทัดต่อชิ้นก็พอ บอกว่าใช้กับรุ่นไหน ขนาดเท่าไหร่ · ถ้ามีเยอะ ให้เริ่มจากสินค้าขายดีก่อน",
      sample: noDesc.slice(0, 3).map((p) => p.t),
    },
    {
      cat: "seo", level: "high",
      title: "ลิงก์ในบทความชี้ไปหน้าที่ไม่มีอยู่แล้ว",
      count: [...dead.values()].reduce((s, n) => s + n, 0),
      unit: "ลิงก์",
      why: "คนอ่านกดแล้วเจอหน้าไม่พบ ออกจากเว็บทันที · Google เจอบ่อย ๆ จะลดความน่าเชื่อถือของทั้งเว็บ (เป็นข้อที่แอป SEO ที่เคยจ่ายรายเดือนตรวจให้)",
      how: "สินค้าพวกนี้เลิกขายไปแล้ว — แก้ลิงก์ในบทความให้ชี้ไปสินค้าที่ใช้แทนกันได้ หรือชี้ไปหน้าหมวดแทน",
      sample: [...dead.keys()].slice(0, 3).map((u) => u.replace("/products/", "")),
    },
    {
      cat: "seo", level: "high",
      title: "สินค้าชื่อซ้ำกันเป๊ะ",
      count: dupTitleCount,
      why: "ชื่อเหมือนกันทำให้ Google เลือกโชว์แค่หน้าเดียว ที่เหลือถูกกลบทั้งหมด ทั้งที่เป็นคนละของ — เสียหน้าขายฟรี ๆ",
      how: "เติมสิ่งที่ต่างกันเข้าไปในชื่อ เช่น ขนาด ความยาวบาร์ จำนวนฟัน หรือรุ่นที่ใช้ได้",
      sample: dupTitle.slice(0, 3).map((v) => `${v[0]} (${v.length} ชิ้น)`),
    },
    {
      cat: "seo", level: "mid",
      title: "ชื่อสินค้ายาวเกิน 60 ตัวอักษร",
      count: longTitle.length,
      why: `Google ตัดชื่อที่ยาวเกิน ${TITLE_MAX} ตัวทิ้งท้ายในผลค้นหา คนเห็นชื่อไม่ครบ กดน้อยลง`,
      how: "ตัดคำซ้ำหรือคำที่ไม่จำเป็นออก เอาคำที่คนค้นจริงไว้ต้นชื่อ",
      sample: longTitle.slice(0, 3).map((p) => p.t),
    },
    {
      cat: "seo", level: "mid",
      title: "คำอธิบายสินค้าซ้ำกันคำต่อคำ",
      count: dupDesc,
      why: "หน้าที่เนื้อหาเหมือนกันเป๊ะถูก Google มองว่าเป็นหน้าซ้ำ แล้วเลือกจัดอันดับให้แค่หน้าเดียว",
      how: "เปลี่ยนอย่างน้อยประโยคแรกให้ตรงกับของชิ้นนั้นจริง ๆ (รุ่นที่ใช้ได้ · ขนาด · จุดสังเกต)",
    },
    {
      cat: "seo", level: "mid",
      title: "สินค้าที่ไม่ได้อยู่ในหมวดไหนเลย",
      count: orphan.length,
      why: "หน้าที่ไม่มีลิงก์จากหมวดไหนเลย Google หาเจอยากมาก ต้องรอให้เจอผ่าน sitemap อย่างเดียว และลูกค้าก็เดินมาเจอไม่ได้",
      how: "จัดเข้าหมวดที่ใกล้เคียงที่สุด อย่างน้อยหนึ่งหมวด",
      sample: orphan.slice(0, 3).map((p) => p.t),
    },
    {
      cat: "seo", level: "mid",
      title: "บทความเนื้อหาบาง (สั้นกว่า 800 ตัวอักษร)",
      count: thinArticles.length,
      why: "บทความสั้นแข่งอันดับไม่ได้ และผู้ช่วย AI ไม่หยิบไปอ้างอิงเพราะข้อมูลไม่พอ",
      how: "เพิ่มรายละเอียดจากประสบการณ์ช่างที่ร้าน — สิ่งที่คู่แข่งลอกไม่ได้ · หรือลบทิ้งถ้าไม่มีประโยชน์",
      sample: thinArticles.slice(0, 3).map((a) => a.t),
    },
    {
      cat: "seo", level: "mid",
      title: "บทความไม่มีคำโปรย",
      count: noExcerpt.length,
      why: "คำโปรยคือข้อความที่โผล่ใต้ชื่อในผลค้นหา ไม่มีก็ปล่อยให้ Google ตัดเอาเองซึ่งมักได้ท่อนที่ไม่ชวนกด",
      how: "เขียน 1-2 ประโยคสรุปว่าบทความนี้ตอบอะไร",
    },
    {
      cat: "seo", level: "low",
      title: "บทความที่ไม่มีลิงก์ไปหาสินค้าเลย",
      count: noProductLink,
      why: "คนอ่านจบแล้วไม่รู้จะไปต่อไหน · และบทความที่ลิงก์หาสินค้าช่วยดันอันดับหน้าสินค้านั้นด้วย",
      how: "ใส่ลิงก์ไปสินค้าที่เกี่ยวข้องสัก 1-2 ตัวในเนื้อบทความ",
    },
    {
      cat: "seo", level: "low",
      title: "สินค้ายังไม่มีรีวิว",
      count: noReview.length,
      why: "ดาวรีวิวใต้ลิงก์ในผลค้นหาช่วยให้คนกดเยอะขึ้นชัดเจน และเป็นหลักฐานว่ามีคนซื้อจริง",
      how: "ดึงรีวิวจาก Shopee/Lazada/TikTok ของสินค้าตัวนั้นมาเพิ่ม (มีสคริปต์อยู่แล้วใน scripts/)",
    },
    {
      cat: "seo", level: "low",
      title: "สินค้าไม่มีรหัส SKU",
      count: noSku.length,
      why: "SKU ทำให้ ZORT ตัดสต็อกถูกตัว และทำให้ฟีดสินค้าเข้า Google Merchant ได้",
      how: "เติมรหัสในแคตตาล็อก",
    },
    {
      cat: "seo", level: "low",
      title: "หมวดที่มีสินค้าน้อยกว่า 3 ชิ้น",
      count: collections.filter((c) => inCollection(c.h).filter(sellable).length < 3).length,
      why: "หมวดที่มีของไม่กี่ชิ้นดูโล่ง ลูกค้าเข้าแล้วออก และ Google มองว่าเป็นหน้าคุณภาพต่ำ",
      how: "ยุบรวมกับหมวดใกล้เคียง หรือเติมสินค้าเข้าหมวด",
    },
    {
      cat: "seo", level: "low",
      title: "บทความไม่มีรูปปก",
      count: noArticleImg.length,
      why: "รูปปกใช้ตอนแชร์ลิงก์และในผลค้นหาแบบมีรูป",
      how: "ใส่รูปแรกของบทความเป็นรูปปก",
    },

    // ===================== GEO / AEO ======================================
    {
      cat: "geo", level: "high",
      title: "คลิปในฟีดยังไม่ได้ผูกสินค้า",
      count: clipsNoProduct.length,
      unit: "คลิป",
      why: "คลิปหน้างานจริงคือของที่คู่แข่งไม่มี แต่ถ้าไม่ผูกสินค้า คนดูจบแล้วก็จบเลย กดซื้อต่อไม่ได้ และเครื่องก็ไม่รู้ว่าคลิปนี้เกี่ยวกับสินค้าตัวไหน",
      how: "หลังร้าน → ผูกสินค้ากับคลิป · ทำวันละสิบใบก็เห็นผล",
    },
    {
      cat: "geo", level: "high",
      title: "ยังไม่มีไฟล์ agents.md",
      count: hasAgents ? 0 : 1,
      unit: "ไฟล์",
      why: "agents.md คือไฟล์ที่บอก 'ตัวแทนซื้อของอัตโนมัติ' ของ ChatGPT / Gemini ว่าร้านขายอะไร ค้นยังไง สั่งซื้อยังไง — เทียบได้กับ robots.txt ของยุค AI",
      how: "สร้างไฟล์ public/agents.md (ระบบสร้างให้อัตโนมัติแล้วถ้าขึ้นว่าผ่าน)",
    },
    {
      cat: "geo", level: "high",
      title: "ยังไม่มีไฟล์ llms.txt",
      count: hasLlms ? 0 : 1,
      unit: "ไฟล์",
      why: "llms.txt คือสรุปย่อของทั้งเว็บให้ผู้ช่วย AI อ่านทีเดียวจบ แทนที่จะไล่อ่านทีละหน้าแล้วเข้าใจผิด",
      how: "สร้างไฟล์ public/llms.txt",
    },
    {
      cat: "geo", level: "mid",
      title: "ยังไม่มีไฟล์ llms-full.txt",
      count: hasFull ? 0 : 1,
      unit: "ไฟล์",
      why: "llms.txt เป็นแค่สารบัญ ผู้ช่วย AI ต้องตามไปเปิดทีละหน้าอยู่ดี · llms-full.txt คือเนื้อหาทั้งร้านในไฟล์เดียว ดึงครั้งเดียวรู้จักสินค้าครบทุกตัว โอกาสถูกหยิบไปตอบสูงขึ้นมาก",
      how: "ระบบสร้างให้อัตโนมัติทุกครั้งที่ deploy (scripts/gen-llms-full.mjs)",
    },
    {
      cat: "geo", level: "mid",
      title: "หัวข้อในบทความยังไม่ได้เขียนเป็นคำถาม",
      count: heads - headQ,
      unit: "หัวข้อ",
      why: "ลูกค้าถาม AI เป็นประโยคคำถาม (\"โซ่ 3/8 ใช้กับรุ่นไหนได้บ้าง\") ผู้ช่วย AI จึงหยิบหัวข้อที่เป็นคำถามไปตอบก่อนเสมอ — หัวข้อบอกเล่าธรรมดามีโอกาสถูกอ้างอิงน้อยกว่ามาก",
      how: `เปลี่ยนหัวข้อย่อยให้เป็นคำถามที่ลูกค้าถามจริง แล้วตอบให้จบใน 2-3 ประโยคแรกใต้หัวข้อนั้น · ตอนนี้เป็นคำถามอยู่ ${headQ} จาก ${heads} หัวข้อ`,
      sample: headSample,
    },
    {
      cat: "geo", level: "mid",
      title: "สินค้าที่ AI ยังตอบแทนร้านไม่ได้",
      count: noSpec.length,
      why: "ไม่มีทั้งตัวเลือกให้เลือกและคำอธิบายที่ยาวพอ — เวลาลูกค้าถาม AI ว่า \"ตัวนี้ใช้กับรุ่นอะไร\" มันจะตอบไม่ได้ แล้วไปแนะนำร้านอื่นที่ข้อมูลครบกว่าแทน",
      how: "ใส่รุ่นเครื่องที่ใช้ได้ · ขนาด · วัสดุ ลงในคำอธิบาย อย่างน้อย 2 บรรทัด",
      sample: noSpec.slice(0, 3).map((p) => p.t),
    },
    {
      cat: "geo", level: "high",
      title: "เว็บยังปิดไม่ให้เก็บข้อมูล",
      count: crawlable ? 0 : 1,
      unit: "เรื่อง",
      why: "robots.txt สั่งห้ามทั้งเว็บ — ทำอย่างอื่นดีแค่ไหนก็ไม่มีผล เพราะทั้ง Google และผู้ช่วย AI เข้าไม่ได้เลย",
      how: "แก้ public/robots.txt ให้เปิด",
    },

    // ===================== ความเร็ว =======================================
    {
      cat: "speed", level: "mid",
      title: "รูปที่ไฟล์ใหญ่เกิน 250KB",
      count: bigImgs.length,
      unit: "ไฟล์",
      why: "รูปใหญ่คือตัวถ่วงหน้าเว็บอันดับต้น ๆ บนมือถือเน็ตช้า — ลูกค้าต่างจังหวัดรอไม่ไหวแล้วกดออก",
      how: "ย่อรูปพวกนี้ให้เหลือกว้างไม่เกิน 1200px แล้วบันทึกเป็น WebP",
      sample: bigImgs.slice(0, 3),
    },
    {
      cat: "speed", level: "low",
      title: "รูปที่ยังเป็น JPG / PNG",
      count: legacy,
      unit: "ไฟล์",
      why: "WebP เล็กกว่าราว 30% ที่ความคมชัดเท่ากัน — เปลี่ยนแล้วลูกค้าโหลดเร็วขึ้นทันทีโดยไม่ต้องแก้อะไรอีก",
      how: "แปลงทีเดียวทั้งโฟลเดอร์ด้วย cwebp แล้วอัปทับ",
    },
  ];

  const findings = all.filter((f) => f.count > 0);

  // คะแนนแต่ละด้าน: หักตามน้ำหนักปัญหาที่เจอ เทียบกับจำนวนที่ตรวจในด้านนั้น
  const weight = { high: 3, mid: 2, low: 1, ok: 0 };
  const base: Record<Cat, number> = {
    seo: sell.length + articles.length,
    geo: sell.length + articles.length + feedClips.length,
    speed: imgTotal,
  };
  const scoreOf = (c: Cat) => {
    const n = base[c] || 1;
    const mine = findings.filter((f) => f.cat === c);
    const penalty = mine.reduce((s, f) => s + (f.count * weight[f.level]) / n, 0);
    let v = Math.round(100 - penalty * 12);
    // ⚠️ เพดานคะแนน — กันเลขสวยหลอกตา
    //    ด้านที่ยังมีงานค้างต้องไม่ขึ้น 100 และด้านที่มีงาน "ควรแก้ก่อน" ต้องไม่ขึ้น 90
    //    ไม่งั้นจะเกิดหน้าที่เขียนว่า 100 คะแนน แต่ข้างล่างลิสต์ปัญหาไว้สองข้อ
    //    (ตัวหารเป็นจำนวนของทั้งหมด ปัญหาไม่กี่ชิ้นในของหลายพันชิ้นจึงถูกกลบจนมองไม่เห็น)
    if (mine.length) v = Math.min(v, 99);
    if (mine.some((f) => f.level === "high")) v = Math.min(v, 89);
    return Math.max(0, Math.min(100, v));
  };
  const scores: Record<Cat, number> = { seo: scoreOf("seo"), geo: scoreOf("geo"), speed: scoreOf("speed") };

  return {
    files,
    findings: findings.sort((a, b) => weight[b.level] - weight[a.level] || b.count - a.count),
    scores,
    score: Math.round((scores.seo + scores.geo + scores.speed) / 3),
    crawlable,
    stats: {
      สินค้าที่ขายได้: sell.length,
      สินค้าทั้งหมด: products.length,
      หมวดหมู่: collections.length,
      บทความ: articles.length,
      คลิปในฟีด: feedClips.length,
      คลิปที่กดซื้อได้: feedClips.length - clipsNoProduct.length,
      สินค้าที่มีรีวิว: sell.length - noReview.length,
      ไฟล์รูปทั้งหมด: imgTotal,
      น้ำหนักรูปรวมเมกะไบต์: Math.round(imgBytes / 1048576),
    },
  };
}
