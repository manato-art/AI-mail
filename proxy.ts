import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isAuthEnabled, verifySessionToken } from "@/lib/auth";

/**
 * ログイン自体に必要な経路と、外部サービスが叩く経路。
 * Webhook はパスワードを持てないので除外するが、署名検証で守っている。
 */
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/webhooks/calendly",
  // 外部cronはログインCookieを持てない。CRON_SECRET で route 側が検証する
  "/api/collection/cron",
]);

/**
 * 認証を掛けてはいけない経路。
 *
 * ここを取りこぼすと画面描画に必要な JS/CSS 自体がログイン画面へ
 * リダイレクトされ、ログイン画面が真っ白になる（実際に起きた）。
 * matcher の否定先読みは取りこぼしやすいので、コード側で明示的に判定する。
 */
function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.(?:js|css|map|png|jpg|jpeg|gif|svg|ico|webp|avif|woff2?|ttf|otf|eot)$/i.test(pathname)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的アセットは認証の判定より前に通す
  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  // APP_PASSWORD 未設定なら素通し（ローカル開発を止めない）。
  // 本番で未設定だと無防備なので、設定画面に警告を出している。
  if (!isAuthEnabled()) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token, Date.now())) {
    return NextResponse.next();
  }

  // API はリダイレクトすると fetch 側が HTML を受け取って壊れるので 401 を返す
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  }
  return NextResponse.redirect(loginUrl);
}

export const proxyConfig = {
  matcher: ["/:path*"],
};
