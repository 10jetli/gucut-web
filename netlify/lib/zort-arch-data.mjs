// สร้างอัตโนมัติโดย scripts/gen-zort-arch.mjs ตอน build — **ห้ามแก้ด้วยมือ**
// แก้ที่นี่จะถูกเขียนทับรอบหน้า และทำให้ผัง ZORT ในหลังร้านโกหกจนกว่าจะมีคนสังเกต
export const ZORT_ARCH = {
  "generatedAt": "2026-09-20T05:52:18.269Z",
  "calls": [
    {
      "endpoint": "Bundle/AddBundle",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Bundle"
    },
    {
      "endpoint": "Bundle/GetBundleDetail",
      "kind": "read",
      "files": [
        "netlify/lib/core-products.mjs"
      ],
      "module": "Bundle"
    },
    {
      "endpoint": "Bundle/GetBundles",
      "kind": "read",
      "files": [
        "netlify/functions/stock.mjs",
        "netlify/lib/core-products.mjs"
      ],
      "module": "Bundle"
    },
    {
      "endpoint": "Contact/AddContact",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Contact"
    },
    {
      "endpoint": "Contact/GetContacts",
      "kind": "read",
      "files": [
        "netlify/lib/core-contacts.mjs",
        "netlify/lib/zort-archived-probe.mjs"
      ],
      "module": "Contact"
    },
    {
      "endpoint": "Document/GetDocuments",
      "kind": "read",
      "files": [
        "netlify/lib/zort-docfilter-probe.mjs",
        "netlify/lib/zort-document-rows.mjs",
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Document"
    },
    {
      "endpoint": "Order/AddOrder",
      "kind": "write",
      "files": [
        "netlify/functions/orders.mjs",
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Order"
    },
    {
      "endpoint": "Order/GetOrders",
      "kind": "read",
      "files": [
        "netlify/functions/core.mjs",
        "netlify/lib/core-sync.mjs",
        "netlify/lib/zort-order.mjs"
      ],
      "module": "Order"
    },
    {
      "endpoint": "Product/AddProduct",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Product"
    },
    {
      "endpoint": "Product/DeleteProduct",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Product"
    },
    {
      "endpoint": "Product/GetProductDetail",
      "kind": "read",
      "files": [
        "netlify/lib/core-products.mjs",
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Product"
    },
    {
      "endpoint": "Product/GetProducts",
      "kind": "read",
      "files": [
        "netlify/functions/status.mjs",
        "netlify/functions/stock.mjs",
        "netlify/lib/connections.mjs",
        "netlify/lib/core-products.mjs",
        "netlify/lib/zort-archived-probe.mjs",
        "netlify/lib/zort-missing-products-probe.mjs",
        "netlify/lib/zort-stock.mjs",
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Product"
    },
    {
      "endpoint": "Product/UpdateProduct",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Product"
    },
    {
      "endpoint": "Product/UpdateProductImage",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Product"
    },
    {
      "endpoint": "PurchaseOrder/AddPurchaseOrder",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "PurchaseOrder"
    },
    {
      "endpoint": "PurchaseOrder/GetPurchaseOrderDetail",
      "kind": "read",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "PurchaseOrder"
    },
    {
      "endpoint": "PurchaseOrder/GetPurchaseOrders",
      "kind": "read",
      "files": [
        "netlify/lib/core-purchases.mjs",
        "netlify/lib/zort-write.mjs"
      ],
      "module": "PurchaseOrder"
    },
    {
      "endpoint": "Quotation/AddQuotation",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Quotation"
    },
    {
      "endpoint": "Quotation/EditQuotation",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Quotation"
    },
    {
      "endpoint": "Quotation/GetQuotationDetail",
      "kind": "read",
      "files": [
        "netlify/lib/core-purchases.mjs"
      ],
      "module": "Quotation"
    },
    {
      "endpoint": "Quotation/GetQuotations",
      "kind": "read",
      "files": [
        "netlify/lib/core-purchases.mjs"
      ],
      "module": "Quotation"
    },
    {
      "endpoint": "Quotation/VoidQuotation",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Quotation"
    },
    {
      "endpoint": "ReturnOrder/AddReturnOrder",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "ReturnOrder"
    },
    {
      "endpoint": "ReturnOrder/GetReturnOrderDetail",
      "kind": "read",
      "files": [
        "netlify/lib/core-purchases.mjs"
      ],
      "module": "ReturnOrder"
    },
    {
      "endpoint": "ReturnOrder/GetReturnOrders",
      "kind": "read",
      "files": [
        "netlify/lib/core-purchases.mjs"
      ],
      "module": "ReturnOrder"
    },
    {
      "endpoint": "ReturnPurchaseOrder/AddReturnPurchaseOrder",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "ReturnPurchaseOrder"
    },
    {
      "endpoint": "Transfer/GetTransferDetail",
      "kind": "read",
      "files": [
        "netlify/lib/core-purchases.mjs"
      ],
      "module": "Transfer"
    },
    {
      "endpoint": "Transfer/GetTransfers",
      "kind": "read",
      "files": [
        "netlify/lib/core-purchases.mjs"
      ],
      "module": "Transfer"
    },
    {
      "endpoint": "Warehouse/AddWarehouse",
      "kind": "write",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Warehouse"
    },
    {
      "endpoint": "Warehouse/GetWarehouses",
      "kind": "read",
      "files": [
        "netlify/lib/core-purchases.mjs"
      ],
      "module": "Warehouse"
    },
    {
      "endpoint": "Webhook/GetWebhook",
      "kind": "read",
      "files": [
        "netlify/lib/zort-write.mjs"
      ],
      "module": "Webhook"
    }
  ],
  "modules": [
    {
      "module": "Bundle",
      "endpoints": [
        "Bundle/AddBundle",
        "Bundle/GetBundleDetail",
        "Bundle/GetBundles"
      ],
      "reads": 2,
      "writes": 1
    },
    {
      "module": "Contact",
      "endpoints": [
        "Contact/AddContact",
        "Contact/GetContacts"
      ],
      "reads": 1,
      "writes": 1
    },
    {
      "module": "Document",
      "endpoints": [
        "Document/GetDocuments"
      ],
      "reads": 1,
      "writes": 0
    },
    {
      "module": "Order",
      "endpoints": [
        "Order/AddOrder",
        "Order/GetOrders"
      ],
      "reads": 1,
      "writes": 1
    },
    {
      "module": "Product",
      "endpoints": [
        "Product/AddProduct",
        "Product/DeleteProduct",
        "Product/GetProductDetail",
        "Product/GetProducts",
        "Product/UpdateProduct",
        "Product/UpdateProductImage"
      ],
      "reads": 2,
      "writes": 4
    },
    {
      "module": "PurchaseOrder",
      "endpoints": [
        "PurchaseOrder/AddPurchaseOrder",
        "PurchaseOrder/GetPurchaseOrderDetail",
        "PurchaseOrder/GetPurchaseOrders"
      ],
      "reads": 2,
      "writes": 1
    },
    {
      "module": "Quotation",
      "endpoints": [
        "Quotation/AddQuotation",
        "Quotation/EditQuotation",
        "Quotation/GetQuotationDetail",
        "Quotation/GetQuotations",
        "Quotation/VoidQuotation"
      ],
      "reads": 2,
      "writes": 3
    },
    {
      "module": "ReturnOrder",
      "endpoints": [
        "ReturnOrder/AddReturnOrder",
        "ReturnOrder/GetReturnOrderDetail",
        "ReturnOrder/GetReturnOrders"
      ],
      "reads": 2,
      "writes": 1
    },
    {
      "module": "ReturnPurchaseOrder",
      "endpoints": [
        "ReturnPurchaseOrder/AddReturnPurchaseOrder"
      ],
      "reads": 0,
      "writes": 1
    },
    {
      "module": "Transfer",
      "endpoints": [
        "Transfer/GetTransferDetail",
        "Transfer/GetTransfers"
      ],
      "reads": 2,
      "writes": 0
    },
    {
      "module": "Warehouse",
      "endpoints": [
        "Warehouse/AddWarehouse",
        "Warehouse/GetWarehouses"
      ],
      "reads": 1,
      "writes": 1
    },
    {
      "module": "Webhook",
      "endpoints": [
        "Webhook/GetWebhook"
      ],
      "reads": 1,
      "writes": 0
    }
  ],
  "jobs": [
    {
      "name": "beam-sweep",
      "cron": "*/30 * * * *",
      "zort": true,
      "via": [
        "zort-order.mjs"
      ]
    },
    {
      "name": "bundle-recipe-sync",
      "cron": "0 3 * * *",
      "zort": true,
      "via": [
        "core-products.mjs"
      ]
    },
    {
      "name": "bundle-stock-sync",
      "cron": "33 * * * *",
      "zort": true,
      "via": [
        "core-products.mjs"
      ]
    },
    {
      "name": "contacts-sync",
      "cron": "19 * * * *",
      "zort": true,
      "via": [
        "core-contacts.mjs"
      ]
    },
    {
      "name": "core-sync",
      "cron": "13 * * * *",
      "zort": true,
      "via": [
        "core-products.mjs",
        "core-purchases.mjs",
        "core-sync.mjs",
        "shopee-stock.mjs"
      ]
    },
    {
      "name": "returns-sync",
      "cron": "7 */3 * * *",
      "zort": true,
      "via": [
        "core-purchases.mjs"
      ]
    },
    {
      "name": "backup-run",
      "cron": "40 */6 * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "credit-sample",
      "cron": "53 * * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "live-sweep",
      "cron": "0 19 * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "mkp-fees-sync",
      "cron": "47 * * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "permit-remind",
      "cron": "30 2 * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "shopee-reviews-pull",
      "cron": "20 17 * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "slips-sync",
      "cron": "50 * * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "stock-push-sweep",
      "cron": "*/15 * * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "stock-push-sweep-shopee",
      "cron": "5,20,35,50 * * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "stock-push-sweep-tiktok",
      "cron": "10,25,40,55 * * * *",
      "zort": false,
      "via": []
    },
    {
      "name": "token-refresh",
      "cron": "30 20 * * *",
      "zort": false,
      "via": []
    }
  ],
  "probedCandidates": [
    {
      "endpoint": "Product/GetProductWarehouse",
      "files": [
        "netlify/lib/core-products.mjs"
      ]
    },
    {
      "endpoint": "Stock/list",
      "files": [
        "netlify/lib/core-products.mjs"
      ]
    },
    {
      "endpoint": "Warehouse/list",
      "files": [
        "netlify/lib/core-products.mjs"
      ]
    }
  ],
  "blindSpots": [
    "arch-data.mjs",
    "awaiting-approval.mjs",
    "backup.mjs",
    "beam-sweep.mjs",
    "carriers.mjs",
    "core-freshness.mjs",
    "core-orders.mjs",
    "core-returns.mjs",
    "core-stock.mjs",
    "coredb.mjs",
    "cron-table.mjs",
    "endpoints.mjs",
    "env-report.mjs",
    "lazada.mjs",
    "list-filters-measured.mjs",
    "marketplace-listings.mjs",
    "mkp-finance-probe.mjs",
    "mkp-finance.mjs",
    "order-finalize.mjs",
    "order-status.mjs",
    "ordercheck-shipping.mjs",
    "peak.mjs",
    "pos.mjs",
    "product-image-mirror.mjs",
    "returned-fields.mjs",
    "shopee-orders.mjs",
    "slip-scan.mjs",
    "stock-moves.mjs",
    "stock-push-common.mjs",
    "stock-push-live.mjs",
    "stock-push-sweep.mjs",
    "stock-push.mjs",
    "tg.mjs",
    "tiktok-orders.mjs",
    "value-scope.mjs",
    "warehouse-values.mjs",
    "warn-keys.mjs"
  ],
  "manual": {
    "asOf": "2026-09-20",
    "source": "ท่านประธานบอกเอง",
    "roles": [
      {
        "who": "บัญชี",
        "uses": "ออกเอกสารขาย/ภาษี แล้วส่งต่อเข้า PEAK",
        "ourReplacement": "core/peak",
        "blocker": "รอคีย์ PEAK (ต้องแพ็กเกจ PRO Plus)"
      },
      {
        "who": "พนักงานแพ็คสินค้า",
        "uses": "ดูใบที่ต้องส่ง · แพ็ก · ตัดส่ง · **เช็กสต็อก**",
        "ourReplacement": "core/packing",
        "blocker": "ส่วน 'ปรับยอดสต็อก' ย้ายไม่ได้ — ZORT ไม่มี API ให้ยิงกลับ"
      },
      {
        "who": "พนักงานตอบแชท",
        "uses": "ตอบ LINE/Facebook ที่ social.zortout.com แล้วเปิดบิลจากแชท",
        "ourReplacement": "core/chat",
        "blocker": "ต้องย้าย webhook LINE — เป็นประตูทางเดียว ทำเป็นขั้นสุดท้าย"
      },
      {
        "who": "พนักงานขายหน้าร้าน",
        "uses": "เครื่องคิดเงิน POS 2 สาขา (KLD · ANJ)",
        "ourReplacement": "core/pos",
        "blocker": "ท่านประธานบอก 20 ก.ย. 2569 ว่า 'ไม่ใช่ปัญหา'"
      }
    ],
    "flow": {
      "asOf": "2026-09-20",
      "nodes": [
        {
          "id": "quotation",
          "menu": "ใบเสนอราคา",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ขาย",
          "ours": "core/quotations"
        },
        {
          "id": "order",
          "menu": "รายการขาย",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ขาย",
          "ours": "core/sales",
          "stock": "ตัดออก"
        },
        {
          "id": "returnorder",
          "menu": "รับคืนสินค้า",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ขาย",
          "ours": "core/return-orders",
          "stock": "เพิ่มเข้า"
        },
        {
          "id": "purchaseorder",
          "menu": "ใบสั่งซื้อ",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ซื้อ",
          "ours": "core/purchases"
        },
        {
          "id": "receive",
          "menu": "รับสินค้าเข้าคลัง",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ซื้อ",
          "ours": "core/receive",
          "stock": "เพิ่มเข้า"
        },
        {
          "id": "returnpo",
          "menu": "คืนสินค้าผู้ขาย",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ซื้อ",
          "ours": "—",
          "stock": "ตัดออก"
        },
        {
          "id": "transfer",
          "menu": "โอนย้ายสินค้า",
          "ชนิด": "เมนูแถบข้าง",
          "group": "คลัง",
          "ours": "core/transfers",
          "stock": "ย้ายคลัง ยอดรวมเท่าเดิม"
        },
        {
          "id": "product",
          "menu": "สินค้า",
          "ชนิด": "เมนูแถบข้าง",
          "group": "คลัง",
          "ours": "core/stock"
        },
        {
          "id": "bundle",
          "menu": "สินค้าชุด",
          "ชนิด": "เมนูแถบข้าง",
          "group": "คลัง",
          "ours": "core/bundles"
        },
        {
          "id": "warehouse",
          "menu": "คลัง/สาขา",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ตั้งค่า",
          "ours": "core/branches"
        },
        {
          "id": "contact",
          "menu": "ลูกค้า/คู่ค้า",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ผู้ติดต่อ",
          "ours": "core/customers"
        },
        {
          "id": "document",
          "menu": "เอกสารบัญชี",
          "ชนิด": "เมนูแถบข้าง",
          "group": "เอกสาร",
          "ours": "core/accounting-docs"
        },
        {
          "id": "channel",
          "menu": "ช่องทางขาย (Shopee/Lazada/TikTok)",
          "group": "เชื่อมต่อ",
          "ชนิด": "ยังไม่ยืนยันว่าเป็นเมนู",
          "ours": "core/channels"
        },
        {
          "id": "social",
          "menu": "แชท (social.zortout.com)",
          "group": "เชื่อมต่อ",
          "ชนิด": "คนละเว็บ",
          "ours": "core/chat"
        },
        {
          "id": "pos",
          "menu": "ขายหน้าร้าน POS",
          "ชนิด": "เมนูแถบข้าง",
          "group": "ขาย",
          "ours": "core/pos"
        },
        {
          "id": "peak",
          "menu": "PEAK (นอก ZORT)",
          "group": "ปลายทาง",
          "ชนิด": "นอก ZORT",
          "ours": "core/peak"
        }
      ],
      "edges": [
        {
          "from": "channel",
          "to": "order",
          "label": "ดึงออเดอร์เข้า",
          "basis": "code"
        },
        {
          "from": "pos",
          "to": "order",
          "label": "ขายหน้าร้านกลายเป็นใบขาย",
          "basis": "std"
        },
        {
          "from": "social",
          "to": "order",
          "label": "เปิดบิลจากแชท",
          "basis": "std"
        },
        {
          "from": "quotation",
          "to": "order",
          "label": "ใบเสนอราคา → ใบขาย",
          "basis": "std"
        },
        {
          "from": "order",
          "to": "product",
          "label": "ตัดสต็อก",
          "basis": "probe"
        },
        {
          "from": "bundle",
          "to": "product",
          "label": "ขายชุด ⇒ ตัดตามสูตร",
          "basis": "code"
        },
        {
          "from": "returnorder",
          "to": "product",
          "label": "คืนจากลูกค้า ⇒ สต็อกเพิ่ม",
          "basis": "code"
        },
        {
          "from": "purchaseorder",
          "to": "receive",
          "label": "สั่งซื้อ → รับของ",
          "basis": "code"
        },
        {
          "from": "receive",
          "to": "product",
          "label": "รับของ ⇒ สต็อกเพิ่ม",
          "basis": "code"
        },
        {
          "from": "returnpo",
          "to": "product",
          "label": "คืนผู้ขาย ⇒ สต็อกลด",
          "basis": "code"
        },
        {
          "from": "transfer",
          "to": "warehouse",
          "label": "ย้ายระหว่างคลัง",
          "basis": "probe"
        },
        {
          "from": "order",
          "to": "document",
          "label": "ออกใบเสร็จ/ใบกำกับ",
          "basis": "code"
        },
        {
          "from": "document",
          "to": "peak",
          "label": "ส่งยอดขายเข้าบัญชี",
          "basis": "std"
        },
        {
          "from": "contact",
          "to": "order",
          "label": "ใบขายอ้างลูกค้า",
          "basis": "code"
        }
      ],
      "stockRule": "สต็อกใน ZORT ขยับได้ **ทางเอกสารเท่านั้น** (ขาย · ซื้อ/รับของ · คืน · โอน) — ไม่มีเส้น API สำหรับ 'ปรับยอด' และ Product/UpdateProduct ไม่มีช่องจำนวน ⇒ ใครปรับยอดใน ZORT เราดึงกลับมาเห็นได้ แต่ถ้าปรับฝั่งเรา ZORT ไม่มีวันรู้"
    },
    "probe": {
      "at": "2026-09-20",
      "found": [
        "Product",
        "Warehouse",
        "Transfer"
      ],
      "notFound": [
        "Stock",
        "Inventory",
        "Adjust",
        "StockAdjustment",
        "StockTake",
        "Movement",
        "StockMovement",
        "InventoryAdjustment",
        "Adjustment",
        "Lot",
        "Stocks"
      ],
      "note": "ไม่มีเส้น 'ปรับยอดสต็อก' — สต็อกใน ZORT ขยับได้ทางเอกสารเท่านั้น (ขาย/ซื้อ/คืน/โอน) และ Product/UpdateProduct ไม่มีช่องจำนวน (ตรวจซอร์สแล้ว 20 ก.ย. 2569)"
    }
  },
  "selfCheck": {
    "at": "2026-09-20T05:52:18.269Z",
    "problems": [],
    "ok": true
  }
};
