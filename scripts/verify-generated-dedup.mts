/**
 * 「生成済みメールを各社へ送る」一覧の会社単位の選別（lib/generated-dedup.ts）を検証する。
 *
 * 守るべき契約:
 *  1. 同じ会社には1通だけ（宛先アドレスが違っても、最新の1件だけ）
 *  2. その会社に既に送信済み/予約済みなら送らない（画面にも出さない＝サーバ側 409 と一致させる）
 *  3. 無関係な会社を巻き込まない（co.jp などの公開サフィックスで結合しない）
 *  4. フリーメール宛は従来通りアドレス単位（別会社を同一視しない）
 */
import {
  buildHandledCompanies,
  companyKeysOf,
  selectSendableRows,
  type DedupRow,
} from "@/lib/generated-dedup";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

const row = (over: Partial<DedupRow> & { id: number }): DedupRow => ({
  domain: "example.co.jp",
  emails_found_json: JSON.stringify(["info@example.co.jp"]),
  send_status: "unsent",
  scheduled_to_email: null,
  ...over,
});

// --- 1. 同じ会社は最新の1件だけ（宛先アドレスが違っても） ---
{
  const rows = [
    row({ id: 1, domain: "moneyforward.co.jp", emails_found_json: JSON.stringify(["pr@moneyforward.co.jp"]) }),
    row({ id: 2, domain: "moneyforward.co.jp", emails_found_json: JSON.stringify(["info@moneyforward.co.jp"]) }),
    row({ id: 3, domain: "moneyforward.co.jp", emails_found_json: JSON.stringify(["pr@moneyforward.co.jp"]) }),
  ];
  const { sendable, skipped } = selectSendableRows(rows, buildHandledCompanies(rows));
  check("同じ会社は宛先が違っても1件だけ送る", sendable.length === 1 && sendable[0].id === 1);
  check("同じ会社の残りは古い重複として理由が付く",
    skipped.get(2) === "older-duplicate" && skipped.get(3) === "older-duplicate");
}

// --- 2. その会社に既に送信済み/予約済みなら送らない ---
{
  const rows = [
    row({ id: 10, domain: "moneyforward.co.jp", emails_found_json: JSON.stringify(["pr@moneyforward.co.jp"]) }),
    row({ id: 11, domain: "moneyforward.co.jp", emails_found_json: JSON.stringify(["ir@moneyforward.co.jp"]), send_status: "sent" }),
  ];
  const { sendable, skipped } = selectSendableRows(rows, buildHandledCompanies(rows));
  check("会社として送信済みなら未送信の行も送らない", sendable.length === 0);
  check("理由は「この会社は送信済み」", skipped.get(10) === "company-sent");
}
{
  const rows = [
    row({ id: 20, domain: "cyber.co.jp", emails_found_json: JSON.stringify(["a@cyber.co.jp"]) }),
    row({ id: 21, domain: "cyber.co.jp", emails_found_json: null, send_status: "scheduled", scheduled_to_email: "b@cyber.co.jp" }),
  ];
  const { sendable, skipped } = selectSendableRows(rows, buildHandledCompanies(rows));
  check("会社として予約済みなら送らない（予約先アドレスも会社の印に使う）",
    sendable.length === 0 && skipped.get(20) === "company-scheduled");
}

// --- 3. 無関係な会社を巻き込まない（過去のオーバーブロック事故の再発防止） ---
{
  const rows = [
    row({ id: 30, domain: "recruit.co.jp", emails_found_json: JSON.stringify(["a@recruit.co.jp"]), send_status: "sent" }),
    row({ id: 31, domain: "career.co.jp", emails_found_json: JSON.stringify(["b@career.co.jp"]) }),
    row({ id: 32, domain: "example.com", emails_found_json: JSON.stringify(["c@example.com"]) }),
  ];
  const { sendable } = selectSendableRows(rows, buildHandledCompanies(rows));
  check("co.jp を共有する別会社は巻き込まない", sendable.map((r) => r.id).join(",") === "31,32");
}

// --- 4. フリーメール宛はアドレス単位（別会社を同一視しない） ---
{
  const rows = [
    row({ id: 40, domain: "", emails_found_json: JSON.stringify(["shop-a@gmail.com"]) }),
    row({ id: 41, domain: "", emails_found_json: JSON.stringify(["shop-b@gmail.com"]) }),
    row({ id: 42, domain: "", emails_found_json: JSON.stringify(["shop-a@gmail.com"]) }),
  ];
  const { sendable, skipped } = selectSendableRows(rows, buildHandledCompanies(rows));
  check("gmail 宛は別アドレスなら別会社として送る", sendable.map((r) => r.id).join(",") === "40,41");
  check("gmail 宛の同一アドレスは重複として1件だけ", skipped.get(42) === "older-duplicate");
  check("フリーメールは会社キーにならない", companyKeysOf(rows[0])[0] === "email:shop-a@gmail.com");
}

// --- 5. メアド無しは送信対象にならない（理由も付けない＝画面は「メアド無し」を出す） ---
{
  const rows = [row({ id: 50, domain: "noemail.co.jp", emails_found_json: JSON.stringify([]) })];
  const { sendable, skipped } = selectSendableRows(rows, buildHandledCompanies(rows));
  check("メアド無しは送信対象外", sendable.length === 0 && !skipped.has(50));
}

// --- 6. サブドメイン違いは同じ会社として扱う（www 除去・完全一致キー） ---
{
  const rows = [
    row({ id: 60, domain: "www.acme.co.jp", emails_found_json: JSON.stringify(["a@acme.co.jp"]) }),
    row({ id: 61, domain: "acme.co.jp", emails_found_json: JSON.stringify(["b@acme.co.jp"]) }),
  ];
  const { sendable } = selectSendableRows(rows, buildHandledCompanies(rows));
  check("www 有無は同じ会社", sendable.length === 1 && sendable[0].id === 60);
}

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILED"}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
