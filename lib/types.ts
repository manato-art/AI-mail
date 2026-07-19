export interface Service {
  id: number;
  name: string;
  description: string;
  strengths: string;
  target: string;
  lp_url: string | null;
  pdf_path: string | null;
  pdf_extracted_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceInput {
  name: string;
  description: string;
  strengths: string;
  target: string;
  lp_url?: string;
}

export interface Persona {
  id: number;
  name: string;
  title: string;
  gender: string;
  age_range: string;
  company_name: string;
  signature_block: string;
  logic: number;
  passion: number;
  politeness: number;
  salesiness: number;
  length: number;
  created_at: string;
  updated_at: string;
}

export interface PersonaInput {
  name: string;
  title: string;
  gender: string;
  age_range: string;
  company_name: string;
  signature_block: string;
  logic: number;
  passion: number;
  politeness: number;
  salesiness: number;
  length: number;
}

export type SendStatus = "unsent" | "sent" | "replied" | "meeting" | "rejected";

export interface Prospect {
  id: number;
  input_url: string;
  domain: string;
  company_name: string;
  analysis_json: string;
  service_id: number;
  persona_id: number;
  subject: string;
  body: string;
  generated_subject: string;
  generated_body: string;
  emails_found_json: string | null;
  form_url: string | null;
  is_form_only: number;
  compatibility_score: string;
  has_refusal: number;
  refusal_text: string | null;
  send_status: SendStatus;
  created_at: string;
}

/**
 * F4 ハイブリッド文面のモード。
 * - full_ai: 全文をAIが書く（従来の生成メール相当）
 * - hybrid: fixed_part を一字一句変えずに使い、続きを ai_brief の指示でAIが書く
 * - fixed_only: 差し込み変数の解決のみ。AIを使わない（一括送信の既定）
 */
export type ComposeMode = "full_ai" | "hybrid" | "fixed_only";

export interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
  compose_mode: ComposeMode;
  /** hybrid で一字一句変更してはいけない冒頭部分。差し込み変数は使える */
  fixed_part: string;
  /** hybrid で「この後どう続けるか」をAIに伝える指示 */
  ai_brief: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: number;
  filename: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export interface TemplateWithAttachments extends Template {
  attachments: Attachment[];
}

export interface AnalysisResult {
  company_name: string;
  /** 分析前の保存データには存在しないため optional。記載が無い場合は null */
  representative_name?: string | null;
  business_summary: string;
  activities: string[];
  recent_topics: string[];
  compatibility: {
    score: "high" | "medium" | "low";
    reason: string;
  };
  proposal_points: string[];
  hook: string;
}

export interface GenerationResult {
  subject: string;
  body: string;
}

export interface CrawlResult {
  url: string;
  pages: CrawlPage[];
  contactEmails: string[];
  formUrl: string | null;
}

export interface CrawlPage {
  url: string;
  title: string;
  text: string;
}

export interface QualityCheckResult {
  passed: boolean;
  issues: string[];
}

export type SenderAuthStatus = "connected" | "expired" | "revoked";

/** F14: 日程調整ツール。Webhook受信部だけツール別に実装できるよう汎用化 */
export type BookingTool = "calendly" | "timerex" | "spir" | "google" | "other";

export interface Sender {
  id: number;
  email: string;
  display_name: string;
  google_refresh_token_encrypted: string;
  auth_status: SenderAuthStatus;
  daily_limit: number;
  booking_tool: BookingTool;
  booking_url: string;
  created_at: string;
}

export interface SendLog {
  id: number;
  prospect_id: number;
  sender_id: number;
  to_email: string;
  subject: string;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  sent_at: string;
}

/** F1: 収集した企業。同一ドメインは重複登録しない */
export interface Company {
  id: number;
  name: string;
  domain: string | null;
  /** 収集経路（keyword_search / csv_import / manual）。分析のため必須記録 */
  source: string;
  source_detail: string;
  hp_url: string | null;
  lp_url: string | null;
  created_at: string;
}

/** F1/F2: 送信可能な連絡先 */
export interface Contact {
  id: number;
  company_id: number | null;
  company_name: string;
  person_name: string;
  email: string;
  /** 公表アドレスであることの確認記録（特電法の例外要件の基礎） */
  email_source_url: string | null;
  source: string;
  lp_url: string | null;
  notes: string;
  created_at: string;
}

export type SuppressionReason =
  | "optout"
  | "bounce"
  | "refusal_detected"
  | "rejected_reply"
  | "manual";

export type SuppressionTargetType = "email" | "domain";

export interface Suppression {
  id: number;
  target: string;
  target_type: SuppressionTargetType;
  reason: SuppressionReason;
  note: string;
  created_at: string;
}

export interface SendGuardResult {
  canSend: boolean;
  reasons: string[];
}

export interface KeywordCompany {
  name: string;
  sourceUrl: string;
}

export interface CrawlResultWithRefusal extends CrawlResult {
  hasRefusal: boolean;
  refusalText: string | null;
}
