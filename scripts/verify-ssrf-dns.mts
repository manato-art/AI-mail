/**
 * #1 SSRF検証: validateUrlWithDns が「公開ドメインだがDNSが内部IPを指す」偽装を
 * 検出してブロックし、正常な公開IPは通すことを確認する。
 * dns.lookup をモックして解決結果を操作する。
 */
import dnsPromises from "node:dns/promises";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

// dns.lookup をモック（ホスト名→任意IPにマップ）
const ipMap: Record<string, string> = {};
const realLookup = dnsPromises.lookup;
(dnsPromises as any).lookup = async (host: string) => {
  const ip = ipMap[host] ?? "93.184.216.34"; // 既定は公開IP(example.com)
  return [{ address: ip, family: ip.includes(":") ? 6 : 4 }];
};

const { validateUrlWithDns, isPrivateIp } = await import("@/lib/ssrf");

// isPrivateIp 単体
check("127.0.0.1 は private", isPrivateIp("127.0.0.1"));
check("169.254.169.254(メタデータ) は private", isPrivateIp("169.254.169.254"));
check("10.0.0.5 は private", isPrivateIp("10.0.0.5"));
check("::1 は private", isPrivateIp("::1"));
check("93.184.216.34(公開) は public", !isPrivateIp("93.184.216.34"));

// DNS偽装: 公開ドメインだが内部IPに解決される
ipMap["evil.example.com"] = "169.254.169.254";
const r1 = await validateUrlWithDns("https://evil.example.com/");
check("公開ドメイン→メタデータIP偽装をブロック", r1.valid === false);

ipMap["internal.example.com"] = "10.1.2.3";
const r2 = await validateUrlWithDns("https://internal.example.com/");
check("公開ドメイン→内部IP偽装をブロック", r2.valid === false);

// 正常な公開ドメインは通る
ipMap["good.example.com"] = "203.0.113.10";
const r3 = await validateUrlWithDns("https://good.example.com/");
check("正常な公開ドメインは通る", r3.valid === true);

// 文字列段階でのブロック（DNSに行く前）
const r4 = await validateUrlWithDns("http://127.0.0.1/");
check("IPリテラルのlocalhostは文字列段階でブロック", r4.valid === false);
const r5 = await validateUrlWithDns("ftp://good.example.com/");
check("http/https以外はブロック", r5.valid === false);

(dnsPromises as any).lookup = realLookup;
console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
