// ตรวจสุขภาพ SEO / AEO / GEO ของเว็บตัวเอง — ใช้ได้เฉพาะฝั่ง server
//
// คิดตอน build จากข้อมูลจริงในโปรเจกต์ (แคตตาล็อก · บทความ · คลิป)
// ไม่ได้ไปยิงเครื่องมือข้างนอกให้เสียเงินรายเดือน — ของที่ตรวจได้เองก็ตรวจเอง
//
// หลักคิด: บอกเป็น "งานที่ต้องทำ" ไม่ใช่คะแนนลอย ๆ
// ทุกข้อต้องตอบได้ว่า "แก้แล้วได้อะไร" ไม่งั้นก็แค่ตัวเลขให้ดูเล่น
import { articles } from "./articles";
import { collections, inCollection, products, sellable } from "./catalog";
import stillClips from "@/data/still-clips.json";
import { videos } from "./videos";

export type Level = "high" | "mid" | "low" | "ok";

export interface Finding {
  level: Level;
  title: string;       // ปัญหาคืออะไร
  count: number;       // กระทบกี่รายการ
  why: string;         // แก้แล้วได้อะไร
  how: string;         // แก้ยังไง / ใครแก้
  sample?: string[];   // ตัวอย่างที่เจอ
}

const TITLE_MAX = 60;      // ยาวกว่านี้ Google ตัดท้ายทิ้งในผลค้นหา
const THIN_ARTICLE = 800;  // บทความสั้นกว่านี้ถือว่าเนื้อหาบาง

export function audit(): { findings: Finding[]; score: number; stats: Record<string, number> } {
  const sell = products.filter(sellable);
  const still = new Set(stillClips as string[]);

  const noDesc = sell.filter((p) => !p.d || p.d.trim().length < 40);
  const longTitle = sell.filter((p) => p.t.length > TITLE_MAX);
  const noSku = sell.filter((p) => !p.sku);
  const noReview = sell.filter((p) => !p.rv);
  const thinCols = collections.filter((c) => inCollection(c.h).filter(sellable).length < 3);
  const thinArticles = articles.filter((a) => a.body.replace(/<[^>]+>/g, "").length < THIN_ARTICLE);
  const noExcerpt = articles.filter((a) => !a.d || a.d.length < 50);
  const noArticleImg = articles.filter((a) => !a.img);
  const feedClips = videos.filter((v) => !still.has(v.v));
  const clipsNoProduct = feedClips.filter((v) => !v.h);

  const all: Finding[] = [
    {
      level: "high" as const,
      title: "สินค้ายังไม่มีคำอธิบาย",
      count: noDesc.length,
      why: "Google กับผู้ช่วย AI อ่านคำอธิบายเพื่อรู้ว่าสินค้านี้คืออะไร ใช้กับรุ่นไหน — ไม่มีคำอธิบายคือแทบไม่มีโอกาสถูกหยิบไปตอบ และหน้าจะสู้คู่แข่งไม่ได้",
      how: "เขียนสั้น ๆ 2-3 บรรทัดต่อชิ้นก็พอ บอกว่าใช้กับรุ่นไหน ขนาดเท่าไหร่ · ถ้ามีเยอะ ให้เริ่มจากสินค้าขายดีก่อน",
      sample: noDesc.slice(0, 3).map((p) => p.t),
    },
    {
      level: "high" as const,
      title: "คลิปในฟีดยังไม่ได้ผูกสินค้า",
      count: clipsNoProduct.length,
      why: "คลิปหน้างานจริงคือของที่คู่แข่งไม่มี แต่ถ้าไม่ผูกสินค้า คนดูจบแล้วก็จบเลย กดซื้อต่อไม่ได้ และเครื่องก็ไม่รู้ว่าคลิปนี้เกี่ยวกับสินค้าตัวไหน",
      how: "หลังร้าน → ผูกสินค้ากับคลิป · ทำวันละสิบใบก็เห็นผล",
    },
    {
      level: "mid" as const,
      title: "ชื่อสินค้ายาวเกิน 60 ตัวอักษร",
      count: longTitle.length,
      why: `Google ตัดชื่อที่ยาวเกิน ${TITLE_MAX} ตัวทิ้งท้ายในผลค้นหา คนเห็นชื่อไม่ครบ กดน้อยลง`,
      how: "ตัดคำซ้ำหรือคำที่ไม่จำเป็นออก เอาคำที่คนค้นจริงไว้ต้นชื่อ",
      sample: longTitle.slice(0, 3).map((p) => p.t),
    },
    {
      level: "mid" as const,
      title: "บทความเนื้อหาบาง (สั้นกว่า 800 ตัวอักษร)",
      count: thinArticles.length,
      why: "บทความสั้นแข่งอันดับไม่ได้ และผู้ช่วย AI ไม่หยิบไปอ้างอิงเพราะข้อมูลไม่พอ",
      how: "เพิ่มรายละเอียดจากประสบการณ์ช่างที่ร้าน — สิ่งที่คู่แข่งลอกไม่ได้ · หรือลบทิ้งถ้าไม่มีประโยชน์",
      sample: thinArticles.slice(0, 3).map((a) => a.t),
    },
    {
      level: "mid" as const,
      title: "บทความไม่มีคำโปรย",
      count: noExcerpt.length,
      why: "คำโปรยคือข้อความที่โผล่ใต้ชื่อในผลค้นหา ไม่มีก็ปล่อยให้ Google ตัดเอาเองซึ่งมักได้ท่อนที่ไม่ชวนกด",
      how: "เขียน 1-2 ประโยคสรุปว่าบทความนี้ตอบอะไร",
    },
    {
      level: "low" as const,
      title: "สินค้ายังไม่มีรีวิว",
      count: noReview.length,
      why: "ดาวรีวิวใต้ลิงก์ในผลค้นหาช่วยให้คนกดเยอะขึ้นชัดเจน และเป็นหลักฐานว่ามีคนซื้อจริง",
      how: "ดึงรีวิวจาก Shopee/Lazada/TikTok ของสินค้าตัวนั้นมาเพิ่ม (มีสคริปต์อยู่แล้วใน scripts/)",
    },
    {
      level: "low" as const,
      title: "สินค้าไม่มีรหัส SKU",
      count: noSku.length,
      why: "SKU ทำให้ ZORT ตัดสต็อกถูกตัว และทำให้ฟีดสินค้าเข้า Google Merchant ได้",
      how: "เติมรหัสในแคตตาล็อก",
    },
    {
      level: "low" as const,
      title: "หมวดที่มีสินค้าน้อยกว่า 3 ชิ้น",
      count: thinCols.length,
      why: "หมวดที่มีของไม่กี่ชิ้นดูโล่ง ลูกค้าเข้าแล้วออก และ Google มองว่าเป็นหน้าคุณภาพต่ำ",
      how: "ยุบรวมกับหมวดใกล้เคียง หรือเติมสินค้าเข้าหมวด",
      sample: thinCols.slice(0, 3).map((c) => c.t),
    },
    {
      level: "low" as const,
      title: "บทความไม่มีรูปปก",
      count: noArticleImg.length,
      why: "รูปปกใช้ตอนแชร์ลิงก์และในผลค้นหาแบบมีรูป",
      how: "ใส่รูปแรกของบทความเป็นรูปปก",
    },
  ];
  const findings = all.filter((f) => f.count > 0);

  // คะแนน: หักตามน้ำหนักปัญหาที่เจอ เทียบกับจำนวนที่ตรวจ
  const weight = { high: 3, mid: 2, low: 1, ok: 0 };
  const total = sell.length + articles.length + feedClips.length || 1;
  const penalty = findings.reduce((s, f) => s + (f.count * weight[f.level]) / total, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty * 12)));

  return {
    findings: findings.sort((a, b) => weight[b.level] - weight[a.level] || b.count - a.count),
    score,
    stats: {
      สินค้าที่ขายได้: sell.length,
      สินค้าทั้งหมด: products.length,
      หมวดหมู่: collections.length,
      บทความ: articles.length,
      คลิปในฟีด: feedClips.length,
      คลิปที่กดซื้อได้: feedClips.length - clipsNoProduct.length,
      สินค้าที่มีรีวิว: sell.length - noReview.length,
    },
  };
}
