/**
 * Gmail OAuth の CSRF 対策で使う state の受け渡し規約。
 * 開始側（/api/auth/gmail）とコールバック側で同じ定数を使うため切り出している。
 */
export const OAUTH_STATE_COOKIE = "gmail_oauth_state";
export const OAUTH_STATE_MAX_AGE_SEC = 10 * 60;
