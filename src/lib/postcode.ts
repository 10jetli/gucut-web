// ตำบล / อำเภอ / จังหวัด และรหัสไปรษณีย์
//
// บัตรประชาชนไม่มีรหัสไปรษณีย์ แต่ฟอร์ม ลซ.1 มีช่องให้กรอก
// เจ้าของร้านสั่ง (25 ส.ค. 2569) ว่าให้เติมให้เลย ลูกค้าจะได้ไม่ต้องหาเอง
//
// ---------------------------------------------------------------------------
// ⚠️ ข้อมูลมาจากชุดข้อมูลสาธารณะ 7,436 ตำบลทั่วประเทศ ไม่ได้เขียนจากความจำ
//    สร้างด้วย scripts/gen-postcode.mjs (รันใหม่ได้ตลอด)
//
//    เขียนชื่อตำบลหรือรหัสไปรษณีย์จากความจำคือสิ่งที่ห้ามทำเด็ดขาด —
//    มันดูเหมือนถูกแต่ผิดเป็นบางตำบลโดยไม่มีอะไรฟ้อง
//    แล้วลูกค้าเอาไปยื่นเป็นคำรับรองต่อนายทะเบียน
//
// ⚠️ ค่าที่ได้เป็น "ค่าที่เดาให้" เสมอ ต้องให้ลูกค้าแก้ได้และเห็นว่ามันถูกเติมมา
//
// รูปแบบข้อมูล
//   { "<จังหวัด>": { "<อำเภอ>": { "": "<รหัสหลัก>", "<ตำบล>": "" | "<รหัสต่าง>" } } }
//   ค่าว่าง "" แปลว่าตำบลนั้นใช้รหัสหลักของอำเภอ
// ---------------------------------------------------------------------------

import raw from "@/data/postcode.json";

type District = Record<string, string>;              // "" = รหัสหลัก · ที่เหลือคือตำบล
type Tree = Record<string, Record<string, District>>;
const TREE = raw as Tree;

/** ตัดคำนำหน้าที่บัตรใช้ออก เช่น "ต.หนองแคน" → "หนองแคน" */
export const bare = (s: string) =>
  String(s || "").replace(/^(ต\.|ตำบล|แขวง|อ\.|อำเภอ|เขต|จ\.|จังหวัด)\s*/, "").trim();

/**
 * หารหัสไปรษณีย์ — คืน null ถ้าไม่มั่นใจ ดีกว่าเดาแล้วผิด
 *
 * ⚠️ ห้ามคืนค่าแบบ "เอาอันแรกที่เจอในจังหวัด" ถ้าหาอำเภอไม่เจอ
 *    จังหวัดหนึ่งมีได้หลายสิบรหัส เดาแบบนั้นผิดแน่นอนเกือบทุกครั้ง
 */
export function findPostcode(province: string, amphoe: string, tambon: string): string | null {
  const p = TREE[bare(province)];
  if (!p) return null;
  const a = p[bare(amphoe)];
  if (!a) return null;
  const t = a[bare(tambon)];
  // ตำบลที่รหัสต่างจากรหัสหลักของอำเภอมีอยู่ 513 ตำบล ต้องใช้ค่าของตำบลนั้น
  if (t) return t;
  return a[""] || null;
}

/** รายชื่อจังหวัดทั้ง 77 */
export const PROVINCES = Object.keys(TREE).sort();

// ---------------------------------------------------------------------------
// ตรวจและแก้ที่อยู่ที่อ่านมาจากบัตร
//
// ⚠️ ทำไมต้องมี — ตัวอ่านสลับ "ตำบล" กับ "อำเภอ" กันได้ และสะกดผิดได้
//    เจอของจริง 26 ส.ค. 2569 กับบัตรที่เขียนว่า "ต.กู่กาสิงห์ อ.เกษตรวิสัย จ.ร้อยเอ็ด"
//    ตัวอ่านให้มา ตำบล=เกษตรวิสัย · อำเภอ=ภูกาสิงห์  (สลับกัน + สะกดผิด)
//    ทั้งสองอย่างไม่มีอะไรฟ้องเลย ลูกค้าพิมพ์ออกมายื่นได้ทั้งที่ที่อยู่ผิด
//
// ⚠️ กติกาการแก้ให้ — เข้มไว้ก่อน เพราะ "แก้ผิด" แย่กว่า "ไม่แก้"
//    1. แก้ก็ต่อเมื่อค่าที่ได้มา "ไม่มีอยู่จริง" ในข้อมูลราชการเท่านั้น
//    2. ตัวเลือกที่ใกล้เคียงต้องมี "ตัวเดียว" ถ้ามีหลายตัวให้ปล่อยไว้
//    3. ทุกช่องที่ถูกแก้ต้องบอกกลับไปให้หน้าจอไฮไลต์ ห้ามแก้เงียบ ๆ
// ---------------------------------------------------------------------------

/** ระยะห่างของคำแบบ Levenshtein — ใช้เทียบชื่อที่สะกดเพี้ยนไปนิดเดียว */
function dist(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * หาชื่อที่ใกล้เคียงที่สุด — คืน null ถ้าไม่มั่นใจ
 *
 * ⚠️ ต้องมีตัวเลือกที่ใกล้ที่สุด "ตัวเดียว" ถึงจะยอมแก้
 *    เสมอกันสองตัว = เดา 50/50 ซึ่งไม่ต่างจากโยนเหรียญ ปล่อยไว้ให้ลูกค้าแก้เองดีกว่า
 */
function nearest(name: string, list: string[]): string | null {
  const q = bare(name);
  if (q.length < 3) return null;
  // ยอมเพี้ยนได้ตามความยาวคำ คำสั้นยอมน้อย คำยาวยอมมาก
  const max = q.length <= 5 ? 1 : q.length <= 9 ? 2 : 3;
  let best: string | null = null, bestD = Infinity, ties = 0;
  for (const c of list) {
    const d = dist(q, c);
    if (d < bestD) { bestD = d; best = c; ties = 1; }
    else if (d === bestD) ties++;
  }
  return bestD <= max && ties === 1 ? best : null;
}

export interface FixedAddress {
  tambon: string;
  amphoe: string;
  province: string;
  postcode: string;
  /** ชื่อช่องที่ระบบแก้ให้ — หน้าจอต้องไฮไลต์ให้ลูกค้าดูอีกที */
  changed: string[];
}

// ---------------------------------------------------------------------------
// แผนสำรอง: จังหวัดใช้ไม่ได้ ให้ยึด "อำเภอ" เป็นสมอแทน
//
// ⚠️ ทำไมต้องมี — เจอของจริง 26 ส.ค. 2569 กับบัตรเจ้าของร้านเอง
//    บัตรเขียน "ต.หนองแคน อ.ดงหลวง จ.มุกดาหาร" (ถ่ายแนวนอน)
//    AI ตอบมา ตำบล=ทุ่งคลอง(แต่งขึ้นเอง ไม่มีบนบัตร) · อำเภอ=หนองแคน · จังหวัด=คงหลวง
//    คือเลื่อนค่าจริงไปคนละช่อง แล้วช่องจังหวัดได้อำเภอที่สะกดเพี้ยน
//    ทางหลักยอมแพ้ทันทีเพราะ "คงหลวง" ไม่ใช่จังหวัด → ลูกค้าได้ที่อยู่มั่วทั้งชุด
//    ทั้งที่ทั้งประเทศมี อ.ดงหลวง ที่สะกดใกล้ "คงหลวง" อยู่แห่งเดียว
//    และในนั้นมี ต.หนองแคน พอดี — ข้อมูลพอสืบกลับได้ ไม่ควรยอมแพ้
//
// วิธี: เอาค่าทั้งสามช่องมาลองเป็น "ชื่ออำเภอ" ทีละตัว (เทียบตรงก่อน เพี้ยนทีหลัง)
//      เจออำเภอที่ไหน เอาค่าที่เหลือลองเป็นตำบลในอำเภอนั้น
//      ได้คำตอบครบชุด "หนึ่งเดียว" เท่านั้นถึงยอมใช้ — กำกวมเมื่อไหร่ถอย
// ⚠️ ถ้าจังหวัดที่ให้มามีอยู่จริง ห้ามย้ายไปจังหวัดอื่น (สมอจังหวัดแน่นกว่า)
// ---------------------------------------------------------------------------
function rescueByAmphoe(
  values: string[], provinceIn: string,
): { tambon: string; amphoe: string; province: string; postcode: string } | null {
  // ผู้สมัครแต่ละชุดมี "คะแนนความเพี้ยน" = ระยะสะกดของอำเภอ + ของตำบล รวมกัน
  // ⚠️ ตัดสินด้วยคะแนน ไม่ใช่ "ต้องเจอชุดเดียว" — ชื่อไทยสะกดใกล้กันเยอะ
  //    เคสจริง: คงหลวง เพี้ยนใกล้ทั้ง ดงหลวง(1) และ ภูหลวง(2) เจอสองชุดเสมอ
  //    แต่ชุดที่ตำบลตรงเป๊ะ (หนองแคน@ดงหลวง เพี้ยนรวม 1) ชนะชุดขยะ
  //    (หนองคัน@ภูหลวง เพี้ยนรวม 3) ขาดลอย — ต้องชนะขาดเท่านั้นถึงยอมใช้
  const triples = new Map<string, { t: string; a: string; p: string; score: number }>();

  for (const v of values) {
    if (!v || v.length < 3) continue;
    // อำเภอชื่อ (หรือใกล้เคียง) v มีอยู่จังหวัดไหนบ้าง
    for (const exact of [true, false]) {
      const hits: { p: string; a: string; d: number }[] = [];
      for (const p of PROVINCES) {
        if (exact) {
          if (TREE[p][v]) hits.push({ p, a: v, d: 0 });
        } else {
          const g = nearest(v, Object.keys(TREE[p]));
          if (g) hits.push({ p, a: g, d: dist(v, g) });
        }
      }
      for (const h of hits) {
        const aNode = TREE[h.p][h.a];
        const rest = values.filter((x) => x && x !== v);
        // ตำบลจากค่าที่เหลือ — เทียบตรงก่อน แล้วค่อยยอมสะกดเพี้ยน
        let t = rest.find((x) => x !== "" && x in aNode) || null;
        let td = 0;
        if (!t) {
          const tambons = Object.keys(aNode).filter((k) => k !== "");
          for (const x of rest) {
            const g = nearest(x, tambons);
            if (g) { t = g; td = dist(x, g); break; }
          }
        }
        if (!t) continue;
        const key = `${t}|${h.a}|${h.p}`;
        const score = h.d + td;
        const old = triples.get(key);
        if (!old || score < old.score) triples.set(key, { t, a: h.a, p: h.p, score });
      }
      if (hits.length) break;     // เทียบตรงเจอแล้ว ไม่ต้องลดมาตรฐานไปรอบเพี้ยน
    }
  }

  const list = [...triples.values()].sort((x, y) => x.score - y.score);
  if (!list.length) return null;
  // ต้องชนะขาด: เพี้ยนน้อยกว่าอันดับสองจริง ๆ — เสมอกัน = เดา 50/50 ไม่เอา
  if (list.length > 1 && list[0].score >= list[1].score) return null;
  const r = list[0];
  if (TREE[provinceIn] && r.p !== provinceIn) return null;
  return { tambon: r.t, amphoe: r.a, province: r.p, postcode: findPostcode(r.p, r.a, r.t) || "" };
}

/**
 * ตรวจที่อยู่กับข้อมูลราชการ แล้วแก้เท่าที่มั่นใจจริง ๆ
 *
 * ⚠️ หาจังหวัดไม่เจอ = ไม่แก้อะไรเลย คืนค่าเดิมทั้งชุด
 *    ไม่มีจังหวัดก็ไม่มีหลักให้ยึด เดาต่อไปคือมั่วล้วน
 */
export function fixThaiAddress(
  tambonIn: string, amphoeIn: string, provinceIn: string,
): FixedAddress {
  let tambon = bare(tambonIn), amphoe = bare(amphoeIn), province = bare(provinceIn);
  const changed: string[] = [];
  // ค่าตั้งต้นตามที่อ่านมาจากบัตร — ใช้เทียบว่าแผนสำรองแก้ช่องไหนบ้าง
  // (เทียบกับตัวแปร let ไม่ได้ เพราะทางหลักอาจแก้มันไปก่อนถึงแผนสำรอง)
  const t0 = tambon, a0 = amphoe, p0 = province;

  // ผลจากแผนสำรอง — ช่องไหนต่างจากที่ให้มาคือช่องที่ถูกแก้ ต้องบอกให้ครบ
  const rescued = (r: { tambon: string; amphoe: string; province: string; postcode: string }): FixedAddress => ({
    ...r,
    changed: [
      r.tambon !== t0 && "tambon",
      r.amphoe !== a0 && "amphoe",
      r.province !== p0 && "province",
    ].filter(Boolean) as string[],
  });

  // ---- จังหวัด
  let pNode = TREE[province];
  if (!pNode && province) {
    const guess = nearest(province, PROVINCES);
    if (guess) { province = guess; pNode = TREE[guess]; changed.push("province"); }
  }
  if (!pNode) {
    const r = rescueByAmphoe([tambon, amphoe, province], province);
    return r ? rescued(r) : { tambon, amphoe, province, postcode: "", changed };
  }

  const districts = Object.keys(pNode);

  // ---- สลับตำบลกับอำเภอกันไหม
  //      เงื่อนไขต้องครบทั้งสองทาง: ที่ให้มาเป็นอำเภอไม่ได้ แต่ที่อยู่ช่องตำบลเป็นอำเภอได้
  //      ครบทั้งสองทางถึงจะมั่นใจว่าสลับ ไม่ใช่แค่สะกดผิด
  if (amphoe && tambon && !pNode[amphoe] && pNode[tambon]) {
    [tambon, amphoe] = [amphoe, tambon];
    changed.push("tambon", "amphoe");
  }

  // ---- อำเภอสะกดเพี้ยน
  if (amphoe && !pNode[amphoe]) {
    const guess = nearest(amphoe, districts);
    if (guess) { amphoe = guess; if (!changed.includes("amphoe")) changed.push("amphoe"); }
  }

  // ---- ตำบลสะกดเพี้ยน (ตรวจได้ทุกอำเภอแล้ว หลังเก็บชื่อตำบลครบ)
  const aNode = pNode[amphoe];
  if (aNode && tambon && !(tambon in aNode)) {
    const tambons = Object.keys(aNode).filter((k) => k !== "");
    const guess = nearest(tambon, tambons);
    if (guess) { tambon = guess; if (!changed.includes("tambon")) changed.push("tambon"); }
  }

  const postcode = findPostcode(province, amphoe, tambon) || "";
  // จังหวัดถูกแต่หาอำเภอ/ตำบลไม่เจอเลย — ลองแผนสำรองก่อนยอมแพ้
  // (rescueByAmphoe ไม่ยอมย้ายจังหวัดอยู่แล้วเมื่อจังหวัดที่ให้มามีจริง)
  if (!postcode) {
    const r = rescueByAmphoe([tambon, amphoe, province], province);
    if (r) return rescued(r);
  }
  return { tambon, amphoe, province, postcode, changed };
}
