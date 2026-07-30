/**
 * DBに入っている日時文字列を、日本時間の表示に変換する。
 *
 * DBの日時は `'YYYY-MM-DD HH:MM:SS'`（タイムゾーンの印が無い形）で入っている。
 * サーバ（Railway コンテナ）は TZ を設定していないので UTC 基準で書かれる。
 * つまり **この形の文字列は UTC として読む**のが正しい（app/collection の実装が正）。
 *
 * ブラウザの `new Date("2026-07-22 12:49:00")` は**閲覧者のローカル時刻**として解釈するため、
 * そのまま渡すと日本の利用者には9時間ずれた時刻が出る。必ずここを通す。
 *
 * ISO形式（`T` と `Z`／オフセット付き）はそのまま信頼する。
 */

/** DBの素の日時文字列をどのタイムゾーンとして読むか。サーバがUTCで動く前提 */
const NAIVE_TIMEZONE_SUFFIX = "Z";

export function parseDbDate(value: string | null | undefined): Date | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const hasZone = /[Zz]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw);
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(hasZone ? iso : iso + NAIVE_TIMEZONE_SUFFIX);
  return Number.isNaN(date.getTime()) ? null : date;
}

type Style = "date" | "dateTime" | "dateTimeSec" | "shortDateTime";

const OPTIONS: Record<Style, Intl.DateTimeFormatOptions> = {
  date: { year: "numeric", month: "2-digit", day: "2-digit" },
  dateTime: { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
  dateTimeSec: {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  },
  shortDateTime: { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" },
};

/** 日本時間で整形する。読めない値は元の文字列をそのまま返す（黙って空にしない） */
export function formatJst(value: string | null | undefined, style: Style = "dateTime"): string {
  const date = parseDbDate(value);
  if (!date) return (value ?? "").trim();
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", ...OPTIONS[style] });
}

/** Gmail が返す epoch ミリ秒（Gmail側の受理時刻）を日本時間で整形する */
export function formatJstFromMs(ms: number | null | undefined, style: Style = "dateTimeSec"): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", ...OPTIONS[style] });
}

/**
 * 2つの時刻の差（分）。予約時刻と実際の送信時刻のズレを出すのに使う。
 * どちらかが読めなければ null。
 */
export function diffMinutes(
  a: string | null | undefined,
  b: string | null | undefined
): number | null {
  const da = parseDbDate(a);
  const db = parseDbDate(b);
  if (!da || !db) return null;
  return Math.round((da.getTime() - db.getTime()) / 60000);
}
