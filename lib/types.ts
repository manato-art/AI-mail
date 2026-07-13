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
  created_at: string;
}

export interface AnalysisResult {
  company_name: string;
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
