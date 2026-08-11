// สร้าง payload QR PromptPay ตามมาตรฐาน EMVCo (ใช้ได้กับแอพธนาคารทุกแอพ)
// target = เบอร์มือถือ (0812345678), เลขบัตรประชาชน 13 หลัก, หรือ e-Wallet ID 15 หลัก

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

// CRC16-CCITT (0xFFFF) ตามสเปก EMV
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function promptPayPayload(target: string, amount?: number): string {
  const digits = target.replace(/[^0-9]/g, "");
  let account: string;
  if (digits.length === 13) {
    account = tlv("02", digits); // บัตรประชาชน
  } else if (digits.length === 15) {
    account = tlv("03", digits); // e-Wallet
  } else {
    // เบอร์มือถือ → 0066 + ตัดศูนย์นำหน้า
    account = tlv("01", "0066" + digits.replace(/^0/, ""));
  }

  let payload =
    tlv("00", "01") + // เวอร์ชัน
    tlv("01", amount ? "12" : "11") + // 12 = จ่ายครั้งเดียว, 11 = ใช้ซ้ำได้
    tlv("29", tlv("00", "A000000677010111") + account) + // PromptPay AID + บัญชี
    tlv("53", "764") + // สกุลเงินบาท
    (amount ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "TH");

  payload += "6304"; // CRC placeholder
  return payload + crc16(payload);
}
