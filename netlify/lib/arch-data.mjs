// สร้างอัตโนมัติโดย scripts/gen-arch.mjs ตอน build — **ห้ามแก้ด้วยมือ**
// แก้ที่นี่จะถูกเขียนทับรอบหน้า และทำให้ผังในหลังร้านโกหกจนกว่าจะมีคนสังเกต
export const ARCH = {
  "generatedAt": "2026-09-05T22:48:55.514Z",
  "site": "gucut.com",
  "project": "gucut-storefront",
  "repo": "gucut-web",
  "functions": {
    "count": 51,
    "scheduled": [
      {
        "name": "backup-run",
        "cron": "40 * * * *"
      },
      {
        "name": "beam-sweep",
        "cron": "*/30 * * * *"
      },
      {
        "name": "core-sync",
        "cron": "13,43 * * * *"
      },
      {
        "name": "live-sweep",
        "cron": "0 19 * * *"
      },
      {
        "name": "permit-remind",
        "cron": "30 2 * * *"
      },
      {
        "name": "shopee-reviews-pull",
        "cron": "20 17 * * *"
      },
      {
        "name": "token-refresh",
        "cron": "30 20 * * *"
      }
    ]
  },
  "edge": [
    "ai-bots"
  ],
  "blobs": [
    "gucut-admin",
    "gucut-chat",
    "gucut-clips",
    "gucut-coupon",
    "gucut-idscan",
    "gucut-live",
    "gucut-orders",
    "gucut-peak",
    "gucut-permits",
    "gucut-push",
    "gucut-reviews",
    "gucut-social",
    "gucut-staff",
    "gucut-users"
  ],
  "d1": {
    "tables": [
      "backup_log",
      "backups",
      "bundle_items",
      "bundles",
      "category_values",
      "contacts",
      "core_meta",
      "order_items",
      "orders",
      "products",
      "purchase_order_items",
      "purchase_orders",
      "recon_log",
      "shopee_order_items",
      "shopee_orders",
      "stock_moves",
      "stock_recon_log",
      "stock_snapshots",
      "tiktok_order_items",
      "tiktok_orders",
      "transfers"
    ]
  },
  "integrations": [
    {
      "id": "zort",
      "name": "ZORT V4",
      "what": "สต็อก · ราคา · ออเดอร์ · ทะเบียนสินค้า",
      "envs": [
        "ZORT_STORENAME",
        "ZORT_APIKEY",
        "ZORT_APISECRET"
      ],
      "inCode": true
    },
    {
      "id": "d1",
      "name": "Cloudflare D1",
      "what": "คลังเงา — ฐานข้อมูลของเราเอง",
      "envs": [
        "CLOUDFLARE_D1_TOKEN"
      ],
      "prefix": "^(CLOUDFLARE|CORE_D1)",
      "inCode": true
    },
    {
      "id": "r2",
      "name": "Cloudflare R2",
      "what": "คลิป HLS + รูปสินค้า (เบราว์เซอร์โหลดตรง)",
      "envs": [
        "R2_ACCESS_KEY_ID",
        "R2_BUCKET",
        "R2_ENDPOINT"
      ],
      "inCode": true
    },
    {
      "id": "shopee",
      "name": "Shopee Open API",
      "what": "ออเดอร์ · สต็อก · รีวิว",
      "envs": [
        "SHOPEE_PARTNER_ID",
        "SHOPEE_PARTNER_KEY"
      ],
      "inCode": true
    },
    {
      "id": "tiktok",
      "name": "TikTok Shop API",
      "what": "ออเดอร์ · สินค้า/สต็อก · จัดส่ง",
      "envs": [
        "TIKTOK_APP_KEY",
        "TIKTOK_APP_SECRET",
        "TIKTOK_SERVICE_ID"
      ],
      "inCode": true
    },
    {
      "id": "beam",
      "name": "Beam",
      "what": "รับชำระเงิน + webhook แจ้งเงินเข้า",
      "envs": [
        "BEAM_API_KEY",
        "BEAM_MERCHANT_ID"
      ],
      "inCode": true
    },
    {
      "id": "line",
      "name": "LINE @gucut1",
      "what": "แจ้งเตือนสถานะออเดอร์ถึงลูกค้า",
      "envs": [
        "LINE_MESSAGING_TOKEN"
      ],
      "inCode": true
    },
    {
      "id": "telegram",
      "name": "Telegram",
      "what": "แจ้งเตือนเข้ากลุ่มร้าน + ปุ่มอนุมัติ",
      "envs": [
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID"
      ],
      "inCode": true
    },
    {
      "id": "ai",
      "name": "Netlify AI Gateway",
      "what": "อ่านบัตรประชาชนในหน้าขอทะเบียน",
      "envs": [
        "NETLIFY_AI_GATEWAY_KEY",
        "NETLIFY_AI_GATEWAY_URL",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_BASE_URL"
      ],
      "prefix": "^(NETLIFY_AI_GATEWAY|ANTHROPIC)_",
      "inCode": true
    },
    {
      "id": "peak",
      "name": "PEAK (บัญชี/ภาษี)",
      "what": "สะพานส่งยอดขายเข้าโปรแกรมบัญชี",
      "envs": [
        "PEAK_CONNECT_ID",
        "PEAK_CONNECT_KEY",
        "PEAK_USER_TOKEN"
      ],
      "inCode": true
    },
    {
      "id": "reviews",
      "name": "รับรีวิวจากมาร์เก็ตเพลส",
      "what": "งานตั้งเวลายิงรีวิวใหม่เข้าเว็บ",
      "envs": [
        "REVIEWS_INGEST_SECRET"
      ],
      "inCode": true
    },
    {
      "id": "netlify",
      "name": "Netlify API",
      "what": "ดูเครดิตที่เหลือของร้าน",
      "envs": [
        "NLF_CREDITS_TOKEN",
        "SITE_ID"
      ],
      "inCode": true
    },
    {
      "id": "zort2",
      "name": "ZORT บัญชีที่สอง",
      "what": "ร้านสาขา (ceojet) — ใช้เทียบยอดคลังเงา",
      "envs": [
        "ZORT_STORENAME_2",
        "ZORT_APIKEY_2",
        "ZORT_APISECRET_2"
      ],
      "prefix": "ZORT_.*_2",
      "inCode": true
    },
    {
      "id": "login",
      "name": "เข้าสู่ระบบด้วยโซเชียล",
      "what": "LINE · Facebook · Google (ลูกค้ากดปุ่มเดียว)",
      "envs": [
        "LINE_CHANNEL_ID",
        "FACEBOOK_APP_ID",
        "GOOGLE_CLIENT_ID"
      ],
      "prefix": "(LINE_CHANNEL|FACEBOOK_APP|GOOGLE_CLIENT|FACEBOOK_API)",
      "inCode": true
    },
    {
      "id": "forward",
      "name": "ส่งต่อออเดอร์ (ไม่บังคับ)",
      "what": "ยิงออเดอร์ไปที่อื่นอีกทาง เช่น Make.com",
      "envs": [
        "ORDER_FORWARD_URL"
      ],
      "inCode": true
    }
  ],
  "unlabelled": [
    "AWS_DEFAULT_REGION",
    "AWS_REGION",
    "LAZADA_APP_KEY",
    "LAZADA_APP_SECRET",
    "NETLIFY_API_TOKEN",
    "NETLIFY_AUTH_TOKEN"
  ],
  "loginProviders": [
    "line",
    "facebook",
    "google"
  ],
  "pages": {
    "count": 43
  }
};
