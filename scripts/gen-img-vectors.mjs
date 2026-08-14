// สร้าง "ลายนิ้วมือรูปสินค้า" → public/img-vectors.bin
//
// ใช้กับปุ่มกล้องในช่องค้นหา: ลูกค้าถ่ายรูปอะไหล่ → เบราว์เซอร์แปลงรูปเป็นตัวเลข 512 ตัว
// ด้วยโมเดลตัวเดียวกันนี้ แล้วเทียบกับลายนิ้วมือของสินค้าทั้ง 2,482 รายการในเครื่องลูกค้าเอง
// ไม่มีการส่งรูปออกไปไหน ไม่ต้องต่อบริการ AI ข้างนอก ไม่มีค่าใช้จ่ายรายเดือน
//
// รันเมื่อ: เพิ่ม/เปลี่ยนรูปสินค้า แล้ว commit ไฟล์ .bin ตามไปด้วย
//   node scripts/gen-img-vectors.mjs
// (ไม่ได้อยู่ใน prebuild เพราะใช้เวลาหลายนาที และผลลัพธ์เปลี่ยนเฉพาะตอนรูปเปลี่ยน)
//
// รูปแบบไฟล์ — ลำดับตรงกับ items ใน public/search-index.json เป๊ะ ๆ
//   [0..3]   uint32  จำนวนสินค้า
//   [4..5]   uint16  จำนวนมิติต่อสินค้า (512)
//   [6..]    int8    เวกเตอร์ยาว 1 หน่วย คูณ 127 (สินค้าที่ไม่มีรูป = ศูนย์ทั้งแถว)
import tf from "@tensorflow/tfjs-node";
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const MODEL = "file://" + join(root, "public/model/mobilenet/model.json");
const EMBED_LAYER = "global_average_pooling2d_1";   // [null,512] — ชั้นก่อนหัวจำแนก 1000 ชนิด
const SIZE = 224;
const BATCH = 32;

const index = JSON.parse(readFileSync(join(root, "public/search-index.json"), "utf8"));
const items = index.items;

const base = await tf.loadLayersModel(MODEL);
const model = tf.model({
  inputs: base.inputs,
  outputs: base.getLayer(EMBED_LAYER).output,
});
const DIM = model.outputs[0].shape[1];

// อ่านรูป → ตัวเลข 224×224×3 ช่วง -1..1 (ตรงกับที่ MobileNet ถูกฝึกมา)
async function pixels(file) {
  const { data } = await sharp(file)
    .flatten({ background: "#ffffff" })   // รูปโปร่งใสให้พื้นขาว เหมือนที่ลูกค้าเห็น
    .resize(SIZE, SIZE, { fit: "contain", background: "#ffffff" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const f = new Float32Array(SIZE * SIZE * 3);
  for (let i = 0; i < f.length; i++) f[i] = data[i] / 127.5 - 1;
  return f;
}

const out = new Int8Array(items.length * DIM);
let done = 0;
let missing = 0;

// เก็บงานเป็นชุด ๆ แล้วยิงเข้าโมเดลทีเดียว เร็วกว่าทีละใบมาก
let batch = [];
async function flush() {
  if (!batch.length) return;
  const x = tf.tensor4d(
    Float32Array.from(batch.flatMap((b) => Array.from(b.px))),
    [batch.length, SIZE, SIZE, 3],
  );
  const y = model.predict(x);
  const v = await y.data();
  tf.dispose([x, y]);
  batch.forEach((b, n) => {
    const row = v.subarray(n * DIM, (n + 1) * DIM);
    let norm = 0;
    for (const q of row) norm += q * q;
    norm = Math.sqrt(norm) || 1;
    const at = b.i * DIM;
    for (let d = 0; d < DIM; d++) {
      out[at + d] = Math.max(-127, Math.min(127, Math.round((row[d] / norm) * 127)));
    }
  });
  done += batch.length;
  if (done % 320 < BATCH) process.stdout.write(`\r[vec] ${done}/${items.length}`);
  batch = [];
}

for (let i = 0; i < items.length; i++) {
  const src = items[i].i;
  // เอาเฉพาะรูปที่เก็บไว้เอง — ที่ยังชี้ Shopify อยู่ข้ามไป (ตอนนี้ไม่เหลือแล้ว)
  if (!src || !src.startsWith("/img/")) { missing++; continue; }
  const file = join(root, "public", src);
  if (!existsSync(file)) { missing++; continue; }
  try {
    batch.push({ i, px: await pixels(file) });
  } catch {
    missing++;
    continue;
  }
  if (batch.length >= BATCH) await flush();
}
await flush();

const buf = Buffer.alloc(6 + out.length);
buf.writeUInt32LE(items.length, 0);
buf.writeUInt16LE(DIM, 4);
Buffer.from(out.buffer, out.byteOffset, out.length).copy(buf, 6);
writeFileSync(join(root, "public/img-vectors.bin"), buf);

process.stdout.write("\r");
console.log(
  `[vec] ${done} รูป · มิติละ ${DIM} · ไม่มีรูป ${missing} รายการ · ` +
  `${(buf.length / 1024 / 1024).toFixed(2)} MB → public/img-vectors.bin`,
);
