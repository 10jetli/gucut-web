// ค้นสินค้าด้วยรูป — ทำงานในเครื่องลูกค้าทั้งหมด
//
// ลูกค้าถ่ายรูป → แปลงเป็นตัวเลข 512 ตัวด้วย MobileNet ที่เราเก็บไว้เอง (/model/mobilenet/)
// → เทียบกับ "ลายนิ้วมือ" ของสินค้าทุกใบใน /img-vectors.bin (สร้างด้วย scripts/gen-img-vectors.mjs)
//
// รูปของลูกค้าไม่เคยออกจากเครื่อง — ไม่มีการอัปโหลด ไม่ต่อบริการ AI ข้างนอก
// ของหนักทั้งหมด (tfjs ~1MB + โมเดล 5.3MB + ลายนิ้วมือ 1.2MB) โหลดตอนกดปุ่มกล้องครั้งแรก
// เท่านั้น แล้ว service worker เก็บไว้ให้ ครั้งต่อไปเปิดปุ๊บใช้ได้เลย

export interface Hit {
  h: string;            // handle
  t: string;            // ชื่อ
  i?: string;           // รูป
  p: number;            // ราคา
  c?: number;           // ราคาก่อนลด
  s: number;            // สต็อก
  r?: [number, number]; // [ดาว, จำนวนรีวิว]
  score: number;        // ความเหมือน 0..1
}

interface IndexEntry {
  h: string; t: string; p: number; s: number; c?: number; i?: string; r?: [number, number];
}

const MODEL_URL = "/model/mobilenet/model.json";
const EMBED_LAYER = "global_average_pooling2d_1";
const SIZE = 224;

// ต่ำกว่านี้ถือว่า "ไม่น่าใช่" — ได้จากการลองเทียบรูปจริงกับรูปในคลัง
// (รูปเดียวกันเป๊ะ = 1.00 · ถ่ายเองมุมใกล้เคียง ≈ 0.85-0.92 · คนละอย่าง < 0.7)
export const MIN_SCORE = 0.62;

type Ready = {
  embed: (src: CanvasImageSource) => Promise<Float32Array>;
  vecs: Int8Array;
  dim: number;
  items: IndexEntry[];
};

let loading: Promise<Ready> | null = null;

/** โหลดตัวคิด + ลายนิ้วมือ (ครั้งเดียวต่อการเปิดเว็บ) */
export function prepare(onStep?: (msg: string) => void): Promise<Ready> {
  if (loading) return loading;
  loading = (async () => {
    onStep?.("กำลังเตรียมตัวค้นหา...");
    const [tf, , , layers] = await Promise.all([
      import("@tensorflow/tfjs-core"),
      import("@tensorflow/tfjs-backend-webgl"),
      import("@tensorflow/tfjs-backend-cpu"),
      import("@tensorflow/tfjs-layers"),
    ]);
    // การ์ดจอเร็วกว่ามาก แต่บางเครื่อง/บางเบราว์เซอร์ใช้ไม่ได้ ก็ถอยไปใช้ CPU
    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();

    onStep?.("กำลังโหลดตัวคิด...");
    const base = await layers.loadLayersModel(MODEL_URL);
    const model = layers.model({
      inputs: base.inputs,
      outputs: base.getLayer(EMBED_LAYER).output,
    });

    onStep?.("กำลังโหลดข้อมูลสินค้า...");
    const [binRes, idxRes] = await Promise.all([
      fetch("/img-vectors.bin"),
      fetch("/search-index.json"),
    ]);
    if (!binRes.ok || !idxRes.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
    const bin = await binRes.arrayBuffer();
    const head = new DataView(bin);
    const n = head.getUint32(0, true);
    const dim = head.getUint16(4, true);
    const vecs = new Int8Array(bin, 6, n * dim);
    const items: IndexEntry[] = (await idxRes.json()).items;

    const embed = async (src: CanvasImageSource) => {
      // วาดลงผ้าใบ 224×224 แบบ "ใส่ทั้งรูปไม่บีบสัดส่วน" ให้ตรงกับตอนสร้างลายนิ้วมือ
      const cv = document.createElement("canvas");
      cv.width = SIZE;
      cv.height = SIZE;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIZE, SIZE);
      const w = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).width;
      const h = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).height;
      const k = Math.min(SIZE / w, SIZE / h);
      ctx.drawImage(src, (SIZE - w * k) / 2, (SIZE - h * k) / 2, w * k, h * k);

      const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
      const f = new Float32Array(SIZE * SIZE * 3);
      for (let i = 0, j = 0; i < px.length; i += 4) {
        f[j++] = px[i] / 127.5 - 1;
        f[j++] = px[i + 1] / 127.5 - 1;
        f[j++] = px[i + 2] / 127.5 - 1;
      }
      const x = tf.tensor4d(f, [1, SIZE, SIZE, 3]);
      const y = model.predict(x) as import("@tensorflow/tfjs-core").Tensor;
      const v = (await y.data()) as Float32Array;
      tf.dispose([x, y]);
      let norm = 0;
      for (const q of v) norm += q * q;
      norm = Math.sqrt(norm) || 1;
      const out = new Float32Array(v.length);
      for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
      return out;
    };

    return { embed, vecs, dim, items };
  })();
  loading.catch(() => { loading = null; });   // พังแล้วให้ลองใหม่ได้
  return loading;
}

/** หาสินค้าที่หน้าตาใกล้เคียงที่สุด */
export async function findByImage(
  src: CanvasImageSource,
  onStep?: (msg: string) => void,
  take = 24,
): Promise<Hit[]> {
  const { embed, vecs, dim, items } = await prepare(onStep);
  onStep?.("กำลังดูรูป...");
  const q = await embed(src);

  const scored: { i: number; score: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const at = i * dim;
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += q[d] * vecs[at + d];
    dot /= 127;
    if (dot >= MIN_SCORE) scored.push({ i, score: dot });
  }
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, take).map(({ i, score }) => ({ ...items[i], score }));
}
