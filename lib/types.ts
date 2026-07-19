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

export interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
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
