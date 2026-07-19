import type { NextConfig } from "next";

/**
 * 2026-07-20 のナビ再編で移動したページ。
 * ブックマークや古いリンクが 404 にならないよう転送する。
 *
 * permanent: false（307）にしてあるのは、恒久リダイレクトはブラウザに
 * 強くキャッシュされ、次に構成を変えたときに古い転送先へ固定されてしまうため。
 */
const MOVED_ROUTES: { from: string; to: string }[] = [
  { from: "/keyword-search", to: "/collection/search" },
  { from: "/templates", to: "/settings/templates" },
  { from: "/services", to: "/settings/services" },
  { from: "/personas", to: "/settings/personas" },
  { from: "/suppressions", to: "/settings/suppressions" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "pdf-parse"],
  async redirects() {
    return MOVED_ROUTES.map(({ from, to }) => ({
      source: from,
      destination: to,
      permanent: false,
    }));
  },
};

export default nextConfig;
