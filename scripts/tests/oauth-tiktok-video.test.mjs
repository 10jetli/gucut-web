/* 🔐 ด่านของเส้นเชื่อมบัญชี TikTok ปลายทาง (20 ต.ค. 2569)
 *
 * 🔴 ด่านที่แพงที่สุดของเส้นนี้คือ **"บัญชีที่กดยินยอมตรงกับที่ตั้งใจไหม"**
 *    ยินยอมผิดบัญชี ⇒ คลิปของร้านขึ้นบัญชีคนอื่น แล้ว **กู้คืนยาก** (ต้องให้เจ้าของไปกดลบ)
 *    และวันนี้ทีมเพิ่งเสียเวลาทั้งวันกับคลิปซ้ำบนช่อง YouTube ⇒ ไม่ซ้ำรอยอีก
 *
 * 🔴 **แก้สมมติฐาน 11 พ.ย. 2569** — เดิมเทสนี้บังคับให้เทียบ `username`
 *    และจดไว้ว่า "ด่านที่เทียบ display_name คือด่านหลอก" (ถูกต้องในวันนั้น)
 *    แต่ `username` อ่านได้ต้องมีขอบเขต `user.info.profile` ซึ่ง **แอปนี้ไม่มีสิทธิ์**
 *    (อยู่ในสินค้าที่ยังไม่ได้เพิ่ม ⇒ ต้องยื่นรีวิวใหม่) ⇒ ขอไปแล้วหน้ายินยอมตีกลับทั้งใบ
 *    ⇒ ด่านย้ายหลักฐานไปใช้ **open_id** ซึ่ง `user.info.basic` ให้ และเปลี่ยนเองไม่ได้
 *
 * ⚠️ กับดักที่ตัวทดสอบนี้มีไว้จับ **ตอนนี้**:
 *    ① ขอขอบเขตที่แอปไม่มี ⇒ ยินยอมไม่ได้เลยแต่หน้าตาเหมือนตั้งค่าครบ
 *    ② ปล่อยให้ `display_name` ตัดสินตอนที่ **มี open_id ปักไว้แล้ว**
 *       (ชื่อที่แสดงซ้ำกับเพจ FB/ช่อง YouTube ⇒ ไม่ unique ⇒ ใช้ชี้ขาดไม่ได้)
 *       ชื่อที่แสดงใช้ได้เฉพาะ "ครั้งแรก" ที่ยังไม่มีอะไรปัก และมีคนถือรหัสหลังร้านเปิดลิงก์อยู่
 */
import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { ซอร์สไม่เอาคอมเมนต์ } from './_src.mjs'

const ที่เก็บ = new Map()
mock.module('@netlify/blobs', { namedExports: {
  getStore: () => ({
    get: async (k, o) => {
      if (!ที่เก็บ.has(k)) return null
      const v = ที่เก็บ.get(k)
      return o?.type === 'json' ? v : String(v)
    },
    set: async (k, v) => { ที่เก็บ.set(k, v) },
    setJSON: async (k, v) => { ที่เก็บ.set(k, v) },
    delete: async (k) => { ที่เก็บ.delete(k) },
  }),
} })
let ผ่านด่านรหัส = true
mock.module('../../netlify/lib/admin-gate.mjs', { namedExports: {
  adminGate: async () => (ผ่านด่านรหัส
    ? { ok: true, wants: true, deny: null }
    : { ok: false, wants: true, deny: new Response('no', { status: 401 }) }),
} })

process.env.TIKTOK_VIDEO_CLIENT_KEY = 'ckทดสอบ'
process.env.TIKTOK_VIDEO_CLIENT_SECRET = 'csทดสอบ'

const เส้น = (await import('../../netlify/functions/oauth-tiktok-video.mjs')).default

/** สวม fetch — คืนคำตอบของ TikTok ตามที่เราสั่งในแต่ละเคส */
function สวมFetch({ โทเคน, ผู้ใช้ }) {
  const เรียก = []
  globalThis.fetch = async (u, o) => {
    const url = String(u)
    เรียก.push({ url, body: o?.body ? String(o.body) : '' })
    const ตอบ = (d, status = 200) =>
      new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } })
    if (url.includes('/v2/oauth/token/')) return ตอบ(โทเคน)
    if (url.includes('/v2/user/info/')) return ตอบ(ผู้ใช้)
    throw new Error('เรียก url ที่ไม่ได้เตรียมไว้: ' + url)
  }
  return เรียก
}

const โทเคนดี = { access_token: 'at1', refresh_token: 'rt1', open_id: 'open-1', expires_in: 86400 }
const ผู้ใช้ถูกบัญชี = { data: { user: { open_id: 'open-1', username: 'ajtcut_8', display_name: 'อ.ธง' } }, error: { code: 'ok' } }

const เรียกกลับ = (q) => new Request(`https://gucut.com/api/oauth/tiktok-video/callback?${q}`)

/** ตั้ง state ที่ยังไม่หมดอายุไว้ในที่เก็บ แล้วคืนค่า state นั้น */
async function ติดอาวุธ() {
  ที่เก็บ.clear()
  ผ่านด่านรหัส = true
  const r = await เส้น(new Request('https://gucut.com/api/oauth/tiktok-video'))
  const d = await r.json()
  return new URL(d.ลิงก์).searchParams.get('state')
}

test('ขั้น ① ต้องมีรหัสหลังร้านถึงขอลิงก์ได้ — ไม่งั้น 401', async () => {
  ที่เก็บ.clear(); ผ่านด่านรหัส = false
  const r = await เส้น(new Request('https://gucut.com/api/oauth/tiktok-video'))
  assert.equal(r.status, 401, 'คนแปลกหน้าขอลิงก์ได้ = เอาบัญชีตัวเองมาทับปลายทางเราได้')
  ผ่านด่านรหัส = true
})

test('🔴 ขั้น ① ต้องขอเฉพาะขอบเขตที่แอปมีสิทธิ์จริง — ขอเกินแม้ตัวเดียว ยินยอมไม่ได้ทั้งใบ', async () => {
  ที่เก็บ.clear()
  const r = await เส้น(new Request('https://gucut.com/api/oauth/tiktok-video'))
  const d = await r.json()
  const q = new URL(d.ลิงก์).searchParams
  const scopes = (q.get('scope') || '').split(',')
  for (const s of ['video.publish', 'video.upload', 'user.info.basic']) {
    assert.ok(scopes.includes(s), `ลิงก์ไม่ได้ขอ scope ${s}`)
  }
  /* 🔑 ข้อนี้คือบทเรียนของวันที่ 11 พ.ย. 2569:
     TikTok ตีกลับ **ทั้งคำขอ** ถ้ามีขอบเขตที่แอปไม่มีสิทธิ์ติดไปแม้ตัวเดียว
     ⇒ ขอ "เผื่อไว้" ไม่ใช่ของฟรี มันทำให้เชื่อมบัญชีไม่ได้เลย
     และอาการที่เห็นคือหน้ายินยอมขึ้นคำว่า scope ลอย ๆ ซึ่งชี้สาเหตุไม่ได้ */
  for (const s of ['user.info.profile', 'video.list']) {
    assert.ok(!scopes.includes(s),
      `ยังขอ ${s} อยู่ — แอปไม่มีสิทธิ์นี้ ⇒ หน้ายินยอมจะตีกลับทุกครั้ง`)
  }
  assert.equal(q.get('response_type'), 'code')
  assert.equal(q.get('redirect_uri'), 'https://gucut.com/api/oauth/tiktok-video/callback')
  assert.ok((q.get('state') || '').length >= 24, 'state ต้องยาวพอที่จะเดาไม่ได้')
})

test('ขั้น ③ ครั้งแรก ชื่อที่แสดงไม่ตรง ⇒ ไม่เก็บกุญแจเลย และบอกชื่อที่ได้มา', async () => {
  const state = await ติดอาวุธ()
  สวมFetch({ โทเคน: โทเคนดี,
    ผู้ใช้: { data: { user: { open_id: 'x', display_name: 'ร้านคนอื่น_99' } }, error: { code: 'ok' } } })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  const html = await r.text()
  assert.match(html, /content="บัญชีไม่ตรง"/)
  assert.match(html, /ร้านคนอื่น_99/, 'ต้องบอกว่าได้บัญชีไหนมา ไม่ใช่ปฏิเสธเปล่า ๆ')
  assert.equal(ที่เก็บ.has('tt/refresh'), false, '🔴 เก็บกุญแจของบัญชีผิด = คลิปขึ้นบัญชีคนอื่น')
})

test('🔴 มี open_id ปักไว้แล้ว ⇒ open_id ต้องชนะชื่อที่แสดง — บัญชีปลอมที่ตั้งชื่อว่า "อ.ธง" ต้องไม่ผ่าน', async () => {
  const state = await ติดอาวุธ()
  /* ปักบัญชีจริงไว้ก่อน (เหมือนที่เคยยินยอมสำเร็จมาแล้วรอบหนึ่ง) */
  ที่เก็บ.set('tt/refresh', { refresh_token: 'rt-เดิม', open_id: 'open-1', username: 'ajtcut_8' })
  /* บัญชีนี้ตั้ง display_name ตรงกับของจริงเป๊ะ แต่เป็น open_id ของคนอื่น
     ⇒ ด่านที่ตัดสินด้วยชื่อที่แสดงจะ **ปล่อยผ่าน** นั่นคือบั๊กที่เทสนี้มีไว้จับ */
  สวมFetch({ โทเคน: { ...โทเคนดี, open_id: 'open-ปลอม' },
    ผู้ใช้: { data: { user: { open_id: 'open-ปลอม', display_name: 'อ.ธง' } }, error: { code: 'ok' } } })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  assert.match(await r.text(), /content="บัญชีไม่ตรง"/)
  assert.equal(ที่เก็บ.get('tt/refresh').refresh_token, 'rt-เดิม',
    '🔴 ทับกุญแจเดิมด้วยบัญชีอื่น = คลิปของร้านขึ้นบัญชีคนอื่น และกู้คืนยาก')
})

test('🔴 ไม่ได้ open_id มาเลย ⇒ ห้ามเก็บ — ไม่มีหลักฐานว่าเป็นบัญชีไหน', async () => {
  const state = await ติดอาวุธ()
  สวมFetch({ โทเคน: { access_token: 'at1', refresh_token: 'rt1' },
    ผู้ใช้: { data: { user: { display_name: 'อ.ธง' } }, error: { code: 'ok' } } })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  assert.match(await r.text(), /content="ยืนยันบัญชีไม่ได้"/)
  assert.equal(ที่เก็บ.has('tt/refresh'), false,
    '🔴 เก็บโดยไม่มี open_id = ครั้งต่อไปไม่มีอะไรให้เทียบ ด่านตายเงียบ')
})

test('ขั้น ③ บัญชีตรง ⇒ เก็บกุญแจ + ปัก open_id ไว้ให้รอบต่อไปเทียบได้', async () => {
  const state = await ติดอาวุธ()
  สวมFetch({ โทเคน: โทเคนดี, ผู้ใช้: ผู้ใช้ถูกบัญชี })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  assert.match(await r.text(), /content="สำเร็จ"/)
  const เก็บ = ที่เก็บ.get('tt/refresh')
  assert.equal(เก็บ.refresh_token, 'rt1')
  assert.equal(เก็บ.username, 'ajtcut_8')
  assert.equal(เก็บ.open_id, 'open-1')
})

test('ช่องว่างหน้า-หลังชื่อที่แสดง ต้องไม่ทำให้บัญชีที่ถูกกลายเป็นผิด', async () => {
  const state = await ติดอาวุธ()
  สวมFetch({ โทเคน: โทเคนดี,
    ผู้ใช้: { data: { user: { open_id: 'open-1', display_name: '  อ.ธง ' } }, error: { code: 'ok' } } })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  assert.match(await r.text(), /content="สำเร็จ"/, 'ชื่อที่แสดงมีช่องว่างติดมาได้ ⇒ ต้อง trim ก่อนเทียบ')
})

test('ไม่มี refresh_token ⇒ ห้ามเก็บแล้วบอกว่าสำเร็จ', async () => {
  const state = await ติดอาวุธ()
  สวมFetch({ โทเคน: { access_token: 'at1', open_id: 'o' }, ผู้ใช้: ผู้ใช้ถูกบัญชี })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  assert.match(await r.text(), /content="ไม่ได้refreshtoken"/)
  assert.equal(ที่เก็บ.has('tt/refresh'), false)
})

test('ถามไม่ได้ว่าเป็นบัญชีไหน ⇒ ไม่เก็บกุญแจ และต้องชี้ว่าใช้ขอบเขตไหนอยู่', async () => {
  const state = await ติดอาวุธ()
  สวมFetch({ โทเคน: โทเคนดี,
    ผู้ใช้: { error: { code: 'scope_not_authorized', message: 'scope not authorized' } } })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  const html = await r.text()
  assert.match(html, /content="อ่านบัญชีไม่ได้"/)
  assert.match(html, /user\.info\.basic/, 'ต้องชี้ว่าด่านพึ่งขอบเขตไหน ไม่ใช่บอกแค่ว่าอ่านไม่ได้')
  assert.equal(ที่เก็บ.has('tt/refresh'), false)
})

test('state ใช้ได้ครั้งเดียว — ยิง code เดิมซ้ำต้องไม่ผ่าน', async () => {
  const state = await ติดอาวุธ()
  สวมFetch({ โทเคน: โทเคนดี, ผู้ใช้: ผู้ใช้ถูกบัญชี })
  await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  const r2 = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  assert.match(await r2.text(), /content="(ลิงก์หมดอายุ|ลิงก์ไม่ถูกต้อง)"/)
})

test('state ที่หมดอายุแล้ว ⇒ ตีกลับ', async () => {
  const state = await ติดอาวุธ()
  ที่เก็บ.set(`tt/state/${state}`, { at: Date.now() - 31 * 60 * 1000 })   // เกิน 30 นาที
  สวมFetch({ โทเคน: โทเคนดี, ผู้ใช้: ผู้ใช้ถูกบัญชี })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  assert.match(await r.text(), /content="ลิงก์หมดอายุ"/)
  assert.equal(ที่เก็บ.has('tt/refresh'), false)
})

test('?token=1 ยังไม่เชื่อมบัญชี ⇒ 409 (ไม่ใช่ 500 เปล่า ๆ)', async () => {
  ที่เก็บ.clear(); ผ่านด่านรหัส = true
  const r = await เส้น(new Request('https://gucut.com/api/oauth/tiktok-video?token=1'))
  assert.equal(r.status, 409)
})

test('?token=1 ไม่มีรหัสหลังร้าน ⇒ 401', async () => {
  ที่เก็บ.clear(); ผ่านด่านรหัส = false
  const r = await เส้น(new Request('https://gucut.com/api/oauth/tiktok-video?token=1'))
  assert.equal(r.status, 401)
  ผ่านด่านรหัส = true
})

test('🔑 ?token=1 ต้องเขียน refresh token ตัวใหม่ทับ — TikTok เปลี่ยนตัวทุกครั้งที่ต่ออายุ', async () => {
  ที่เก็บ.clear(); ผ่านด่านรหัส = true
  ที่เก็บ.set('tt/refresh', { refresh_token: 'rt-เก่า', open_id: 'open-1', username: 'ajtcut_8' })
  สวมFetch({ โทเคน: { access_token: 'at2', refresh_token: 'rt-ใหม่', expires_in: 3600 }, ผู้ใช้: ผู้ใช้ถูกบัญชี })
  const r = await เส้น(new Request('https://gucut.com/api/oauth/tiktok-video?token=1'))
  const d = await r.json()
  assert.equal(d.ok, true)
  assert.equal(d.access_token, 'at2')
  assert.equal(ที่เก็บ.get('tt/refresh').refresh_token, 'rt-ใหม่',
    '🔴 ไม่เขียนทับ = ใช้ได้อีกไม่กี่รอบแล้วตายเงียบ (คลาสเดียวกับ Lazada)')
  assert.equal(ที่เก็บ.get('tt/refresh').username, 'ajtcut_8', 'ของเดิมในระเบียนต้องไม่หาย')
})

test('TikTok ตอบ 200 พร้อมช่อง error ⇒ ต้องถือว่าไม่สำเร็จ', async () => {
  const state = await ติดอาวุธ()
  สวมFetch({ โทเคน: { error: 'invalid_grant', error_description: 'code ใช้แล้ว' }, ผู้ใช้: ผู้ใช้ถูกบัญชี })
  const r = await เส้น(เรียกกลับ(`code=c1&state=${state}`))
  assert.match(await r.text(), /content="แลกกุญแจไม่สำเร็จ"/)
  assert.equal(ที่เก็บ.has('tt/refresh'), false)
})

test('ไม่ได้ตั้ง env ⇒ 503 และบอกว่าห้ามใช้คีย์ของแอป Shop ปนกัน', async () => {
  const เก่า = [process.env.TIKTOK_VIDEO_CLIENT_KEY, process.env.TIKTOK_VIDEO_CLIENT_SECRET]
  delete process.env.TIKTOK_VIDEO_CLIENT_KEY
  const r = await เส้น(new Request('https://gucut.com/api/oauth/tiktok-video'))
  assert.equal(r.status, 503)
  assert.match(JSON.stringify(await r.json()), /TikTok Shop/, 'ต้องเตือนเรื่องหยิบคีย์ข้ามคู่')
  ;[process.env.TIKTOK_VIDEO_CLIENT_KEY, process.env.TIKTOK_VIDEO_CLIENT_SECRET] = เก่า
})

test('[อ่านซอร์ส] ชื่อ env ต้องไม่ชนกับแอป TikTok Shop เดิม', () => {
  /* 🔑 ใช้ **ตัวถอดคอมเมนต์กลาง** ไม่ใช่ regex ของตัวเอง
     รอบแรกผมเขียนตัวถอดเป็นสำเนาที่สอง ซึ่งเป็นกับดักที่ `_src.mjs` เตือนไว้ตรงหัวไฟล์:
     *"สองสำเนาของกติกาเดียวกัน จะเพี้ยนแยกกันเสมอ"* (ไฟล์นั้นเคยถูกกินโค้ดจาก regex แบบนี้มาแล้ว)
     ⚠️ และไฟล์ที่ถูกตรวจมีคอมเมนต์เตือนว่า "ห้ามใช้ /api/tiktok/callback ของแอป Shop"
        ⇒ ด่านที่ค้นทั้งไฟล์จะแดงเพราะ **คำเตือนของตัวเอง** ไม่ใช่เพราะโค้ดผิด */
  const src = ซอร์สไม่เอาคอมเมนต์('netlify/functions/oauth-tiktok-video.mjs')
  for (const ห้าม of ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET', 'TIKTOK_SERVICE_ID']) {
    assert.ok(!src.includes(`process.env.${ห้าม}`),
      `เส้นนี้ไปหยิบ ${ห้าม} ของแอป TikTok Shop ซึ่งเป็นคนละระบบ`)
  }
  assert.ok(src.includes('process.env.TIKTOK_VIDEO_CLIENT_KEY'))
  assert.ok(!src.includes('/api/tiktok/callback'), 'นั่นเป็น callback ของแอป TikTok Shop')
})

