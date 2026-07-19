export interface SearchSiteCandidate {
  domain: string;
  label: string;
  genre: string;
}

export const AI_SITE_POOL: SearchSiteCandidate[] = [
  { domain: "wantedly.com", label: "Wantedly", genre: "採用・インターン・スタートアップ" },
  { domain: "green-japan.com", label: "Green", genre: "IT・Web業界の採用" },
  { domain: "en-gage.net", label: "engage", genre: "中小企業の採用" },
  { domain: "prtimes.jp", label: "PR TIMES", genre: "プレスリリース・新サービス" },
];

export const MAX_COUNT_OPTIONS = [10, 20, 30, 50];
