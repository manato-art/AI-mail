/**
 * #6 の土台: フリーメール判定と社名の同一性判定を検証する。
 * これらは「宛先と別会社の分析を掴まない」ための identity 照合の核なので、
 * 表記ゆれ（法人格・全角空白・英語表記）を正しく吸収し、別会社を同一と誤判定しないことを確認する。
 */
import {
  isFreeEmailDomain,
  normalizeCompanyName,
  companyNamesConsistent,
  domainsMatch,
} from "@/lib/email-domains";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// --- isFreeEmailDomain ---
check("gmail.com はフリーメール", isFreeEmailDomain("gmail.com") === true);
check("大文字/前後空白/www. でもフリーメール判定", isFreeEmailDomain("  WWW.Gmail.com ") === true);
check("docomo.ne.jp はフリー（キャリア）", isFreeEmailDomain("docomo.ne.jp") === true);
check("icloud.com はフリー", isFreeEmailDomain("icloud.com") === true);
check("独自ドメインはフリーではない", isFreeEmailDomain("cypherone.co.jp") === false);
check("空文字/undefined は false", isFreeEmailDomain("") === false && isFreeEmailDomain(undefined) === false);

// --- normalizeCompanyName ---
check("株式会社の前置を除去", normalizeCompanyName("株式会社サイバーワン") === "サイバーワン");
check("株式会社の後置を除去", normalizeCompanyName("サイバーワン株式会社") === "サイバーワン");
check("(株)・全角空白を除去", normalizeCompanyName("（株）サイバー　ワン") === "サイバーワン");
check("英語法人格 Inc. を除去", normalizeCompanyName("Cypherone Inc.") === "cypherone");
check("㈱ を除去", normalizeCompanyName("㈱テスト") === "テスト");

// --- companyNamesConsistent ---
check("法人格ゆれは同一とみなす", companyNamesConsistent("株式会社サイバーワン", "サイバーワン") === true);
check("後置・前置の混在も同一", companyNamesConsistent("サイバーワン株式会社", "（株）サイバーワン") === true);
check("完全一致は同一", companyNamesConsistent("ABC商事", "ABC商事") === true);
check("別会社は不一致", companyNamesConsistent("ABC商事", "XYZ工業") === false);
check("部分一致(片方が他方を含む)は同一と“しない”", companyNamesConsistent("商事", "ABC商事") === false);
check("空文字同士は不一致（判定材料なし）", companyNamesConsistent("", "") === false);
check("片方空でも不一致", companyNamesConsistent("ABC商事", "") === false);

// --- companyNamesConsistent: 異なる法人格を明示する別会社は不一致（#6-a 誤マージ防止） ---
check("合同会社 vs 株式会社（同じ基幹名）は別会社→不一致", companyNamesConsistent("サイバーワン合同会社", "サイバーワン株式会社") === false);
check("有限会社 vs 株式会社は別会社→不一致", companyNamesConsistent("有限会社テスト", "株式会社テスト") === false);
check("同じ法人格(株式会社)の前置/後置ゆれは一致", companyNamesConsistent("株式会社サイバーワン", "サイバーワン株式会社") === true);
check("片方だけ法人格あり(株式会社 vs 無印)は一致", companyNamesConsistent("株式会社サイバーワン", "サイバーワン") === true);

// --- domainsMatch（宛先ドメイン照合） ---
check("完全一致は match", domainsMatch("example.co.jp", "example.co.jp") === true);
check("サブドメインは match", domainsMatch("mail.example.co.jp", "example.co.jp") === true);
check("www.は無視して match", domainsMatch("www.example.co.jp", "example.co.jp") === true);
check("別ドメインは非match", domainsMatch("example.co.jp", "other.co.jp") === false);
check(".com と .co.jp は非match", domainsMatch("example.com", "example.co.jp") === false);
check("空は非match", domainsMatch("", "example.co.jp") === false);

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
