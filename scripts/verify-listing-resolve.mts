/**
 * 「検索に依存しない公式サイト特定」の検証。
 *
 * これまでは、収集時に手元にあった掲載ページURLを捨て、裏処理が毎回社名で検索し直していた。
 * 検索が止まると掲載URLを持っている企業まで巻き添えで failed になり、
 * 同名の別会社を掴む危険もあった。ここでは次を確認する:
 *   1. 企業ページのJSON-LDから公式サイトURLと正式社名を取り出せる
 *   2. 自己参照(媒体自身)・媒体運営会社・SNS・求人媒体は公式サイトとして採用しない
 *   3. 収集時に掲載URL（企業ページURL優先）が保存される
 *   4. 掲載URLがあれば検索を1回も呼ばずに公式サイトへ到達する
 *   5. JSON-LDが無ければ null を返し、従来の検索経路にフォールバックする
 *   6. 募集ページしか無い場合でも、媒体へのアクセスは1社あたり2回まで
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dnsPromises from "node:dns/promises";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-mail-listing-"));
process.env.DATABASE_DIR = tmpDir;
process.env.SERPER_API_KEY = "";
process.env.GEMINI_API_KEY = "";

const { extractOfficialSiteFromJsonLd, resolveHomepageFromListing } = await import(
  "@/lib/listing-resolve"
);
const {
  createCollectionSource,
  getCompanyById,
  markCompanyExcluded,
  setSetting,
  upsertCompany,
} = await import("@/lib/db");
const { runCollectionCycle } = await import("@/lib/collection");
const { runEnrichmentBatch } = await import("@/lib/enrichment");
const { getAllCompanies } = await import("@/lib/db");

let pass = 0, fail = 0;
const check = (label: string, cond: boolean) => {
  console.log(`${cond ? "✅" : "❌"} ${label}`);
  cond ? pass++ : fail++;
};

/** 調査バッチは待ち行列の先頭から処理するので、検証したい1社だけを残す */
const keepOnlyPending = (keepId: number) => {
  for (const c of getAllCompanies()) {
    if (c.id !== keepId && c.enrichment_status === "pending") {
      markCompanyExcluded(c.id, "検証対象外として退避");
    }
  }
};

// ---- フィクスチャ（実際のWantedlyのHTML構造に合わせた最小形） ----

/** 企業ページのJSON-LD。媒体自身のOrganizationが同居している点まで再現する */
function companyPageHtml(slug: string, official: string[], legalName: string): string {
  const graph = [
    {
      "@type": "Organization",
      "@id": "https://www.wantedly.com/#organization",
      name: "Wantedly",
      url: "https://www.wantedly.com/",
      sameAs: ["https://wantedlyinc.com", "https://www.facebook.com/wantedly"],
    },
    {
      "@type": "Organization",
      "@id": `https://www.wantedly.com/companies/${slug}#organization`,
      name: "テスト商事",
      legalName,
      url: `https://www.wantedly.com/companies/${slug}`,
      sameAs: official,
      contactPoint: { "@type": "ContactPoint", url: official[0] ?? "" },
    },
  ];
  return `<!doctype html><html><head><title>${slug}</title>
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
</head><body><h1>${legalName}</h1></body></html>`;
}

/** 一覧ページ。カード内に /projects/{id} と /companies/{slug} が併存する */
function listingHtml(cards: { name: string; projectId: string; slug: string }[]): string {
  const body = cards
    .map(
      (c) => `<div class="projects-index-single-abc">
        <a href="/projects/${c.projectId}"><span class="TitleText-xyz">募集タイトル</span></a>
        <a href="/companies/${c.slug}"><span class="CompanyNameText-xyz">${c.name}</span></a>
      </div>`
    )
    .join("\n");
  return `<!doctype html><html><body>${body}</body></html>`;
}

/** 募集ページ。企業ページへのリンクは持つが、公式サイトURLは持たない */
function projectPageHtml(slug: string): string {
  return `<!doctype html><html><body>
    <a href="/companies/${slug}">会社ページ</a>
    <a href="/companies/${slug}/post_articles/1">記事</a>
  </body></html>`;
}

const OFFICIAL_HOST = "official-listing.example.jp";
const officialSiteHtml = (name: string) => `<!doctype html><html><head><title>${name}</title></head>
<body><h1>${name}</h1><p>${name}は検証用の会社です。事業内容の紹介文をここに置きます。</p>
<form action="/inquiry" method="post"><input name="q" /><button>送信</button></form></body></html>`;

// ============ 1〜2. JSON-LD からの抽出（純粋関数） ============
const officialOk = extractOfficialSiteFromJsonLd(
  companyPageHtml("testco", [`https://${OFFICIAL_HOST}`], "株式会社テスト商事"),
  "testco"
);
check("JSON-LDから公式サイトURLを抽出できる", officialOk?.url.includes(OFFICIAL_HOST) === true);
check("正式社名（legalName）も取り出せる", officialOk?.legalName === "株式会社テスト商事");

const selfRef = extractOfficialSiteFromJsonLd(
  companyPageHtml("testco", ["https://www.wantedly.com/companies/testco"], "株式会社テスト商事"),
  "testco"
);
check("媒体自身への自己参照URLは採用しない", selfRef === null);

const snsOnly = extractOfficialSiteFromJsonLd(
  companyPageHtml(
    "testco",
    ["https://www.facebook.com/testco", "https://x.com/testco", "https://note.com/testco"],
    "株式会社テスト商事"
  ),
  "testco"
);
check("SNS・ブログしか無い場合は採用しない", snsOnly === null);

const boardOnly = extractOfficialSiteFromJsonLd(
  companyPageHtml("testco", ["https://en-gage.net/testco", "https://mynavi.jp/testco"], "株式会社テスト商事"),
  "testco"
);
check("求人媒体のURLは公式サイトとして採用しない", boardOnly === null);

// 媒体運営会社のOrganization（@id が媒体トップ）を取り違えると全企業が同じ会社に紐づく
const wrongNode = extractOfficialSiteFromJsonLd(
  companyPageHtml("testco", [], "株式会社テスト商事"),
  "testco"
);
check("媒体運営会社（wantedlyinc.com）を掴まない", wrongNode === null);

check(
  "JSON-LDが無いページは null（例外にしない）",
  extractOfficialSiteFromJsonLd("<html><body>なにもなし</body></html>", "testco") === null
);
check(
  "壊れたJSON-LDでも例外にせず null",
  extractOfficialSiteFromJsonLd(
    '<html><head><script type="application/ld+json">{壊れ</script></head></html>',
    "testco"
  ) === null
);

// ---- ネットワークのモック ----
const realLookup = dnsPromises.lookup;
(dnsPromises as unknown as { lookup: unknown }).lookup = async () => [
  { address: "203.0.113.10", family: 4 },
];

const realFetch = globalThis.fetch;
let searchCalls = 0;
let wantedlyCalls = 0;
const html404 = new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
const htmlOk = (body: string) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html" } });

/** URL ごとに返すHTMLを決める。検索エンドポイントは呼ばれた回数だけ数える */
let routes: Record<string, string> = {};
globalThis.fetch = (async (input: unknown) => {
  const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? "");
  if (url.includes("google.serper.dev") || url.includes("duckduckgo.com")) {
    searchCalls++;
    return htmlOk("<html><body>検索結果なし</body></html>");
  }
  if (url.includes("wantedly.com")) wantedlyCalls++;
  for (const [fragment, body] of Object.entries(routes)) {
    if (url.includes(fragment)) return htmlOk(body);
  }
  if (url.includes(OFFICIAL_HOST)) return htmlOk(officialSiteHtml("テスト商事"));
  return html404;
}) as unknown as typeof fetch;

// ============ 3. 収集時に掲載URLが保存される ============
setSetting("search_mode", "api");
setSetting("serper_api_key", "");

routes = {
  "wantedly.com/projects?": listingHtml([
    { name: "収集テスト商事", projectId: "111", slug: "shuushuu" },
  ]),
};
createCollectionSource("新着", "wantedly.com", "wantedly_direct");
await runCollectionCycle();

const collected = getAllCompanies().find((c) => c.name === "収集テスト商事");
check("収集した企業に掲載URLが保存される", !!collected?.listing_url);
check(
  "募集ページより企業ページURL（/companies/{slug}）を優先して保存する",
  collected?.listing_url === "https://www.wantedly.com/companies/shuushuu"
);

// ============ 4. 掲載URLがあれば検索を呼ばない ============
routes = {
  "wantedly.com/companies/testco": companyPageHtml(
    "testco",
    [`https://${OFFICIAL_HOST}`],
    "株式会社テスト商事"
  ),
};

const listed = upsertCompany({
  name: "テスト商事",
  source: "test",
  listing_url: "https://www.wantedly.com/companies/testco",
  enrichment_status: "pending",
});
keepOnlyPending(listed.id);
searchCalls = 0;
wantedlyCalls = 0;
await runEnrichmentBatch(1);
const listedAfter = getCompanyById(listed.id);

check("掲載URLがあれば検索を1回も呼ばない", searchCalls === 0);
check("媒体へのアクセスは企業ページ1回だけ", wantedlyCalls === 1);
check("公式サイトのHPが保存される", (listedAfter?.hp_url ?? "").includes(OFFICIAL_HOST));
check("調査が完了する（検索が使えなくても到達できる）", listedAfter?.enrichment_status === "done");
check("問い合わせフォームのURLも保存される", !!listedAfter?.form_url);

// ============ 5. JSON-LDが無ければ従来の検索経路にフォールバック ============
setSetting("search_mode", "scrape"); // 検索が呼ばれたことをHTTPで観測できるようにする
routes = { "wantedly.com/companies/nojsonld": "<html><body>公式サイトの記載なし</body></html>" };

const noLd = upsertCompany({
  name: "JSONLDなし社",
  source: "test",
  listing_url: "https://www.wantedly.com/companies/nojsonld",
  enrichment_status: "pending",
});
keepOnlyPending(noLd.id);
searchCalls = 0;
await runEnrichmentBatch(1);
const noLdAfter = getCompanyById(noLd.id);

check("公式URLが取れなければ従来の検索経路に切り替える", searchCalls > 0);
check("フォールバックしても理由を残して終える（握り潰さない）", !!noLdAfter?.enrichment_error);

// ============ 6. 募集ページしか無い場合も媒体アクセスは2回まで ============
setSetting("search_mode", "api");
routes = {
  "wantedly.com/projects/222": projectPageHtml("fromproject"),
  "wantedly.com/companies/fromproject": companyPageHtml(
    "fromproject",
    [`https://${OFFICIAL_HOST}`],
    "株式会社テスト商事"
  ),
};
searchCalls = 0;
wantedlyCalls = 0;

const fromProject = await resolveHomepageFromListing("https://www.wantedly.com/projects/222");
check("募集ページからでも企業ページを辿って公式サイトへ到達する",
  (fromProject?.homepage ?? "").includes(OFFICIAL_HOST));
check("媒体へのアクセスは1社あたり2回まで（募集ページ＋企業ページ）", wantedlyCalls === 2);
check("この経路でも検索は呼ばない", searchCalls === 0);
check("正式社名を後段の照合に渡せる", fromProject?.legalName === "株式会社テスト商事");

globalThis.fetch = realFetch;
(dnsPromises as unknown as { lookup: unknown }).lookup = realLookup;
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  /* Windows ではDBを開いたまま消せないことがある。一時ディレクトリなので放置してよい */
}

console.log(`\n結果: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
