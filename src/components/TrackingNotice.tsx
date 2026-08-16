"use client";

// ข้อความในหน้านโยบายที่ต้องเปลี่ยนตามว่าร้านเปิดพิกเซลไว้หรือเปล่า
//
// เขียนตายตัวไม่ได้ เพราะเจ้าของร้านเปิด/ปิดพิกเซลได้เองจากหลังร้าน
// ถ้าปล่อยข้อความเดิมที่บอกว่า "ไม่ได้ติดตั้ง Facebook Pixel" ไว้ทั้งที่เปิดใช้อยู่
// = ประกาศเท็จกับลูกค้า ผิด PDPA และเป็นข้อที่ Meta/Google ตรวจก่อนอนุมัติบัญชีโฆษณา
import { useEffect, useState } from "react";

interface Cfg {
  meta: { on: boolean };
  tiktok: { on: boolean };
  ga4: { on: boolean };
  ads: { on: boolean };
  line: { on: boolean };
  cf: { on: boolean };
}

export default function TrackingNotice() {
  const [on, setOn] = useState<string[] | null>(null);
  // เครื่องมือที่ "ไม่ใช้คุกกี้" ต้องแยกพูด — เอาไปกองรวมกับพวกใช้คุกกี้ = บอกลูกค้าผิด
  const [cookieless, setCookieless] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/marketing", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c: Cfg | null) => {
        if (!c) { setOn([]); setCookieless([]); return; }
        const names: string[] = [];
        if (c.meta?.on) names.push("Meta Pixel (Facebook / Instagram)");
        if (c.tiktok?.on) names.push("TikTok Pixel");
        if (c.ga4?.on) names.push("Google Analytics 4");
        if (c.ads?.on) names.push("Google Ads");
        if (c.line?.on) names.push("LINE Tag");
        setOn(names);
        setCookieless(c.cf?.on ? ["Cloudflare Web Analytics"] : []);
      })
      .catch(() => { setOn([]); setCookieless([]); });
  }, []);

  // ระหว่างยังไม่รู้ผล ไม่ขึ้นอะไรเลย ดีกว่าขึ้นข้อความผิดแล้วค่อยกระพริบเปลี่ยน
  if (on === null) return null;

  const cookielessLine = cookieless.length > 0 && (
    <> ร้านใช้ {cookieless.join(" · ")} เพื่อนับจำนวนผู้เข้าชมด้วย —
      ตัวนี้<b>ไม่ใช้คุกกี้และไม่ระบุตัวบุคคล</b> เก็บเพียงสถิติรวม</>
  );

  if (on.length === 0) {
    return (
      <>ร้าน<b>ไม่ได้ติดตั้ง</b> Google Analytics, Facebook Pixel หรือสคริปต์โฆษณาติดตามใด ๆ
        บนเว็บนี้ — ไม่มีคุกกี้โฆษณา ไม่มีการตามรอยคุณไปเว็บอื่น{cookielessLine}</>
    );
  }

  return (
    <>ร้าน<b>ติดตั้งเครื่องมือวัดผลโฆษณา</b>บนเว็บนี้ ได้แก่ {on.join(" · ")} —
      เครื่องมือเหล่านี้เก็บข้อมูลการใช้งานของคุณ (หน้าที่เปิด สินค้าที่ดู การหยิบใส่ตะกร้า
      และการสั่งซื้อ) ผ่านคุกกี้ เพื่อวัดผลโฆษณาและแสดงโฆษณาที่ตรงกับความสนใจของคุณ
      โดยข้อมูลจะถูกส่งไปยังผู้ให้บริการเหล่านั้นตามนโยบายของแต่ละราย
      {" "}<b>คุณปฏิเสธได้</b> โดยปิดคุกกี้ของบุคคลที่สามในเบราว์เซอร์
      หรือใช้โหมดไม่ระบุตัวตน ซึ่งไม่กระทบการสั่งซื้อแต่อย่างใด{cookielessLine}</>
  );
}
