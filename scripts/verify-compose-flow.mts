/**
 * 引き継ぎ資料「生成→編集→送信」フローの核心を検証する。
 * 生成時(variables:{})は差し込み変数を残し、送信時(実値)で解決されること。
 * AIゾーンを含まない本文で決定的に確認する（AI呼び出し不要）。
 */
import { composeBody } from "@/lib/compose";
import { resolveVariables, resolveEmailVariables } from "@/lib/variables";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
}

const SUBJECT = "{{company_name}}様へのご提案";
const BODY = "{{person_name}}様\n\nお世話になります。\n{{sender_name}}です。";

// --- 生成フェーズ: variables:{} → 変数はそのまま残る ---
const gen = await composeBody({
  mode: "fixed_only",
  fixedPart: "",
  aiBrief: "",
  body: BODY,
  variables: {},
  service: null,
  persona: null,
  companyName: "テスト株式会社",
  analysis: null,
});
check("生成時: {{person_name}} が本文に残る", gen.body.includes("{{person_name}}"));
check("生成時: {{sender_name}} が本文に残る", gen.body.includes("{{sender_name}}"));

// --- 編集フェーズ: ユーザーが本文を書き換えても、変数はそのまま持ち越せる ---
const edited = gen.body.replace("お世話になります。", "はじめてご連絡いたします。");
check("編集後も {{person_name}} が保持される", edited.includes("{{person_name}}"));

// --- 送信フェーズ: 実値で解決される ---
const values = {
  company_name: "テスト株式会社",
  person_name: "採用ご担当者",
  sender_name: "山田",
};
const sent = resolveEmailVariables(SUBJECT, edited, values);
check("送信時: 件名の{{company_name}}が解決", sent.subject === "テスト株式会社様へのご提案");
check("送信時: 本文の{{person_name}}が解決", sent.body.includes("採用ご担当者様") && !sent.body.includes("{{person_name}}"));
check("送信時: 本文の{{sender_name}}が解決", sent.body.includes("山田です") && !sent.body.includes("{{sender_name}}"));
check("送信時: 編集した文言が反映されている", sent.body.includes("はじめてご連絡いたします"));

// --- 担当者名フォールバック相当: 値が空なら未解決として残る（送信ガードが弾く前提） ---
const missing = resolveVariables("{{person_name}}様", { person_name: "" });
check("空の変数は未解決として残り、unresolvedに載る", missing.text.includes("{{person_name}}") && missing.unresolved.includes("person_name"));

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
