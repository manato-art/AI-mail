/**
 * 日程調整リンクの差し込み（仕様書 F14）。
 *
 * 仕様書は「1通目には入れない（確定）」— カレンダーリンクは返信率が最も低いCTAで、
 * 日本の調査でも嫌う理由の1位が「承諾前なのに会う前提の姿勢」だったため。
 * よって既定はOFFで、2通目以降に送信者が明示的にONにする運用を前提にする。
 */

export const BOOKING_VARIABLE = "{{booking_url}}";

/** 目上・年配層への配慮として「合わなければ知らせてほしい」を必ず添える（仕様書F14の文面ルール） */
const BOOKING_INVITE_LINES = [
  "もしご関心をお持ちいただけましたら、下記より ご都合のよい日時をお選びいただけます。",
  "日程が合わない場合は、その旨お知らせいただけますと幸いです。",
];

const SIGNATURE_MARKERS = ["━━━", "\n---"];

function findSignatureIndex(body: string): number {
  for (const marker of SIGNATURE_MARKERS) {
    const index = body.indexOf(marker);
    if (index !== -1) return index;
  }
  return -1;
}

/**
 * 本文に日程調整リンクを差し込む。
 *
 * テンプレートに {{booking_url}} がある場合は差し込み変数エンジンに任せ、ここでは何もしない
 * （同じリンクが2本入るのを防ぐ。仕様書F9/F14の「リンクは本文に1本まで」）。
 */
export function applyBookingLink(body: string, bookingUrl: string): string {
  const url = bookingUrl.trim();
  if (!url) return body;
  if (body.includes(BOOKING_VARIABLE)) return body;
  if (body.includes(url)) return body;

  const block = `${BOOKING_INVITE_LINES.join("\n")}\n${url}`;
  const signatureIndex = findSignatureIndex(body);

  if (signatureIndex === -1) {
    return `${body.trimEnd()}\n\n${block}\n`;
  }

  const beforeSignature = body.slice(0, signatureIndex).trimEnd();
  const signature = body.slice(signatureIndex);
  return `${beforeSignature}\n\n${block}\n\n${signature}`;
}
