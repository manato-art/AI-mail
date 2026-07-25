/**
 * 一括送信画面で共有する型と小さな道具。
 * page.tsx から表示部品・フックへ切り出したときに、同じ形を二度書かないための置き場。
 */

export interface Recipient {
  id: string;
  company: string;
  person: string;
  email: string;
  checked: boolean;
}

export interface SenderInfo {
  id: number;
  email: string;
  display_name: string;
  auth_status: string;
}

export type RowSendState = "sending" | "sent" | "scheduled" | "failed";

export interface RowStatus {
  state: RowSendState;
  error?: string;
  warning?: string;
}

/** 生成した本文のキャッシュ。warnings は「会社ごとの文面になっていない」警告(#5) */
export interface GeneratedEmail {
  subject: string;
  body: string;
  warnings?: string[];
}

/** 生成済みメール(prospect)の行ごとの処理状態 */
export interface GenRowStatus {
  state: RowSendState;
  error?: string;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
