import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type {
  Attachment,
  BookingTool,
  Company,
  ComposeMode,
  Contact,
  Persona,
  PersonaInput,
  Prospect,
  SendLog,
  Sender,
  SenderAuthStatus,
  Service,
  ServiceInput,
  Suppression,
  SuppressionReason,
  SuppressionTargetType,
  Template,
} from "@/lib/types";

let dbInstance: Database.Database | null = null;

function createTables(instance: Database.Database): void {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      strengths TEXT NOT NULL,
      target TEXT NOT NULL,
      lp_url TEXT,
      pdf_path TEXT,
      pdf_extracted_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT '',
      age_range TEXT NOT NULL DEFAULT '30代',
      company_name TEXT NOT NULL DEFAULT '',
      signature_block TEXT NOT NULL DEFAULT '',
      logic INTEGER NOT NULL DEFAULT 3 CHECK(logic BETWEEN 1 AND 5),
      passion INTEGER NOT NULL DEFAULT 3 CHECK(passion BETWEEN 1 AND 5),
      politeness INTEGER NOT NULL DEFAULT 3 CHECK(politeness BETWEEN 1 AND 5),
      salesiness INTEGER NOT NULL DEFAULT 3 CHECK(salesiness BETWEEN 1 AND 5),
      length INTEGER NOT NULL DEFAULT 3 CHECK(length BETWEEN 1 AND 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_url TEXT NOT NULL,
      domain TEXT NOT NULL,
      company_name TEXT NOT NULL DEFAULT '',
      analysis_json TEXT NOT NULL DEFAULT '{}',
      service_id INTEGER NOT NULL REFERENCES services(id),
      persona_id INTEGER NOT NULL REFERENCES personas(id),
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      generated_subject TEXT NOT NULL DEFAULT '',
      generated_body TEXT NOT NULL DEFAULT '',
      emails_found_json TEXT,
      form_url TEXT,
      is_form_only INTEGER NOT NULL DEFAULT 0,
      compatibility_score TEXT NOT NULL DEFAULT 'medium',
      has_refusal INTEGER NOT NULL DEFAULT 0,
      refusal_text TEXT,
      send_status TEXT NOT NULL DEFAULT 'unsent',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS template_attachments (
      template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      attachment_id INTEGER NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
      PRIMARY KEY (template_id, attachment_id)
    );

    CREATE TABLE IF NOT EXISTS senders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      google_refresh_token_encrypted TEXT NOT NULL,
      auth_status TEXT NOT NULL DEFAULT 'connected',
      daily_limit INTEGER NOT NULL DEFAULT 0,
      booking_tool TEXT NOT NULL DEFAULT 'calendly',
      booking_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS send_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL REFERENCES prospects(id),
      sender_id INTEGER NOT NULL REFERENCES senders(id),
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      gmail_message_id TEXT,
      gmail_thread_id TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT UNIQUE,
      source TEXT NOT NULL DEFAULT 'manual',
      source_detail TEXT NOT NULL DEFAULT '',
      hp_url TEXT,
      lp_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      company_name TEXT NOT NULL DEFAULT '',
      person_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      email_source_url TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      lp_url TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS suppressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'email',
      reason TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(target, target_type)
    );
  `);
}

function seedPersonas(instance: Database.Database): void {
  const { count } = instance
    .prepare("SELECT COUNT(*) as count FROM personas")
    .get() as { count: number };

  if (count > 0) {
    return;
  }

  const insert = instance.prepare(`
    INSERT INTO personas (
      name, title, gender, age_range, company_name, signature_block,
      logic, passion, politeness, salesiness, length
    ) VALUES (
      @name, @title, @gender, @age_range, @company_name, @signature_block,
      @logic, @passion, @politeness, @salesiness, @length
    )
  `);

  const personas = [
    {
      name: "金谷",
      title: "代表取締役",
      gender: "男性",
      age_range: "30代",
      company_name: "Cypher One株式会社",
      signature_block:
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\nCypher One株式会社\n代表取締役　金谷\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n〒150-6139\n東京都渋谷区渋谷2丁目24-12\n渋谷スクランブルスクエア39F WeWork\n━━━━━━━━━━━━━━━━━━━━━━━━━━",
      logic: 3,
      passion: 5,
      politeness: 4,
      salesiness: 4,
      length: 3,
    },
    {
      name: "重南 拓真",
      title: "副代表",
      gender: "男性",
      age_range: "30代",
      company_name: "Cypher One株式会社",
      signature_block:
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\nCypher One株式会社\n副代表　重南 拓真 / Takuma Shigenami\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n〒150-6139\n東京都渋谷区渋谷2丁目24-12\n渋谷スクランブルスクエア39F WeWork\n\n[Mobile] 090-6473-4372\n[Email]  shigenami@cypherone.co.jp\n━━━━━━━━━━━━━━━━━━━━━━━━━━",
      logic: 5,
      passion: 2,
      politeness: 4,
      salesiness: 2,
      length: 3,
    },
    {
      name: "新卒営業",
      title: "営業担当",
      gender: "",
      age_range: "20代",
      company_name: "Cypher One株式会社",
      signature_block: "",
      logic: 2,
      passion: 4,
      politeness: 5,
      salesiness: 2,
      length: 2,
    },
  ];

  const insertAll = instance.transaction((rows: typeof personas) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  insertAll(personas);
}

function seedServices(instance: Database.Database): void {
  const { count } = instance
    .prepare("SELECT COUNT(*) as count FROM services")
    .get() as { count: number };

  if (count > 0) {
    return;
  }

  instance
    .prepare(
      `
    INSERT INTO services (name, description, strengths, target, lp_url)
    VALUES (@name, @description, @strengths, @target, @lp_url)
  `
    )
    .run({
      name: "サンプルサービス",
      description:
        "これはサンプルのサービスです。実際のサービス情報に置き換えてください。",
      strengths: "サンプルの強み",
      target: "サンプルのターゲット",
      lp_url: null,
    });
}

function addColumnIfMissing(
  instance: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const cols = instance.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (cols.some((c) => c.name === column)) return;
  instance.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function migrateSchema(instance: Database.Database): void {
  addColumnIfMissing(instance, "prospects", "send_status", "TEXT NOT NULL DEFAULT 'unsent'");
  addColumnIfMissing(instance, "prospects", "has_refusal", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(instance, "prospects", "refusal_text", "TEXT");
  // F14: 日程調整リンク
  addColumnIfMissing(instance, "senders", "booking_tool", "TEXT NOT NULL DEFAULT 'calendly'");
  addColumnIfMissing(instance, "senders", "booking_url", "TEXT NOT NULL DEFAULT ''");
  // F4: ハイブリッド文面（固定リード + AI続き）
  addColumnIfMissing(instance, "templates", "compose_mode", "TEXT NOT NULL DEFAULT 'fixed_only'");
  addColumnIfMissing(instance, "templates", "fixed_part", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(instance, "templates", "ai_brief", "TEXT NOT NULL DEFAULT ''");
  // F22: 初回メールに資料を添付する事故を構造的に防ぐため、既定は不許可
  addColumnIfMissing(instance, "templates", "allow_attachments", "INTEGER NOT NULL DEFAULT 0");
  // F1: 採用シグナル検出
  addColumnIfMissing(instance, "companies", "recruit_page_url", "TEXT");
}

function seedSettings(instance: Database.Database): void {
  const row = instance
    .prepare("SELECT value FROM settings WHERE key = 'sender_email'")
    .get();
  if (!row) {
    instance
      .prepare("INSERT INTO settings (key, value) VALUES ('sender_email', 'cypherone.inc@gmail.com')")
      .run();
  }
}

function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = process.env.DATABASE_DIR || path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "sales-mail.db");
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");
  // Required for ON DELETE CASCADE on template_attachments (off by default in SQLite)
  instance.pragma("foreign_keys = ON");

  createTables(instance);
  migrateSchema(instance);
  seedPersonas(instance);
  seedServices(instance);
  seedSettings(instance);

  dbInstance = instance;
  return dbInstance;
}

export function getAllServices(): Service[] {
  return getDb()
    .prepare("SELECT * FROM services ORDER BY id ASC")
    .all() as Service[];
}

export function getService(id: number): Service | undefined {
  return getDb()
    .prepare("SELECT * FROM services WHERE id = ?")
    .get(id) as Service | undefined;
}

export function createService(input: ServiceInput): Service {
  const instance = getDb();
  const result = instance
    .prepare(
      `
    INSERT INTO services (name, description, strengths, target, lp_url)
    VALUES (@name, @description, @strengths, @target, @lp_url)
  `
    )
    .run({
      name: input.name,
      description: input.description,
      strengths: input.strengths,
      target: input.target,
      lp_url: input.lp_url ?? null,
    });

  return getService(Number(result.lastInsertRowid)) as Service;
}

export function updateService(
  id: number,
  input: ServiceInput
): Service | undefined {
  const instance = getDb();
  const existing = getService(id);
  if (!existing) {
    return undefined;
  }

  instance
    .prepare(
      `
    UPDATE services
    SET name = @name,
        description = @description,
        strengths = @strengths,
        target = @target,
        lp_url = @lp_url,
        updated_at = datetime('now','localtime')
    WHERE id = @id
  `
    )
    .run({
      id,
      name: input.name,
      description: input.description,
      strengths: input.strengths,
      target: input.target,
      lp_url: input.lp_url ?? null,
    });

  return getService(id);
}

export function deleteService(id: number): boolean {
  try {
    const result = getDb().prepare("DELETE FROM services WHERE id = ?").run(id);
    return result.changes > 0;
  } catch (error) {
    if (error instanceof Database.SqliteError && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return false;
    }
    throw error;
  }
}

export function getAllPersonas(): Persona[] {
  return getDb()
    .prepare("SELECT * FROM personas ORDER BY id ASC")
    .all() as Persona[];
}

export function getPersona(id: number): Persona | undefined {
  return getDb()
    .prepare("SELECT * FROM personas WHERE id = ?")
    .get(id) as Persona | undefined;
}

export function createPersona(input: PersonaInput): Persona {
  const instance = getDb();
  const result = instance
    .prepare(
      `
    INSERT INTO personas (
      name, title, gender, age_range, company_name, signature_block,
      logic, passion, politeness, salesiness, length
    ) VALUES (
      @name, @title, @gender, @age_range, @company_name, @signature_block,
      @logic, @passion, @politeness, @salesiness, @length
    )
  `
    )
    .run({
      name: input.name,
      title: input.title,
      gender: input.gender,
      age_range: input.age_range,
      company_name: input.company_name,
      signature_block: input.signature_block,
      logic: input.logic,
      passion: input.passion,
      politeness: input.politeness,
      salesiness: input.salesiness,
      length: input.length,
    });

  return getPersona(Number(result.lastInsertRowid)) as Persona;
}

export function updatePersona(
  id: number,
  input: PersonaInput
): Persona | undefined {
  const instance = getDb();
  const existing = getPersona(id);
  if (!existing) {
    return undefined;
  }

  instance
    .prepare(
      `
    UPDATE personas
    SET name = @name,
        title = @title,
        gender = @gender,
        age_range = @age_range,
        company_name = @company_name,
        signature_block = @signature_block,
        logic = @logic,
        passion = @passion,
        politeness = @politeness,
        salesiness = @salesiness,
        length = @length,
        updated_at = datetime('now','localtime')
    WHERE id = @id
  `
    )
    .run({
      id,
      name: input.name,
      title: input.title,
      gender: input.gender,
      age_range: input.age_range,
      company_name: input.company_name,
      signature_block: input.signature_block,
      logic: input.logic,
      passion: input.passion,
      politeness: input.politeness,
      salesiness: input.salesiness,
      length: input.length,
    });

  return getPersona(id);
}

export function deletePersona(id: number): boolean {
  try {
    const result = getDb().prepare("DELETE FROM personas WHERE id = ?").run(id);
    return result.changes > 0;
  } catch (error) {
    if (error instanceof Database.SqliteError && error.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return false;
    }
    throw error;
  }
}

export function getAllProspects(): Prospect[] {
  return getDb()
    .prepare("SELECT * FROM prospects ORDER BY id DESC")
    .all() as Prospect[];
}

export function getProspect(id: number): Prospect | undefined {
  return getDb()
    .prepare("SELECT * FROM prospects WHERE id = ?")
    .get(id) as Prospect | undefined;
}

export function createProspect(
  data: Omit<Prospect, "id" | "created_at">
): Prospect {
  const instance = getDb();
  const result = instance
    .prepare(
      `
    INSERT INTO prospects (
      input_url, domain, company_name, analysis_json, service_id, persona_id,
      subject, body, generated_subject, generated_body, emails_found_json,
      form_url, is_form_only, compatibility_score, has_refusal, refusal_text
    ) VALUES (
      @input_url, @domain, @company_name, @analysis_json, @service_id, @persona_id,
      @subject, @body, @generated_subject, @generated_body, @emails_found_json,
      @form_url, @is_form_only, @compatibility_score, @has_refusal, @refusal_text
    )
  `
    )
    .run({
      input_url: data.input_url,
      domain: data.domain,
      company_name: data.company_name,
      analysis_json: data.analysis_json,
      service_id: data.service_id,
      persona_id: data.persona_id,
      subject: data.subject,
      body: data.body,
      generated_subject: data.generated_subject,
      generated_body: data.generated_body,
      emails_found_json: data.emails_found_json ?? null,
      form_url: data.form_url ?? null,
      is_form_only: data.is_form_only,
      compatibility_score: data.compatibility_score,
      has_refusal: data.has_refusal,
      refusal_text: data.refusal_text ?? null,
    });

  return getProspect(Number(result.lastInsertRowid)) as Prospect;
}

export function updateProspect(
  id: number,
  data: {
    subject?: string;
    body?: string;
    generated_subject?: string;
    generated_body?: string;
  }
): Prospect | undefined {
  const instance = getDb();
  const existing = getProspect(id);
  if (!existing) {
    return undefined;
  }

  instance
    .prepare(
      `
    UPDATE prospects
    SET subject = @subject,
        body = @body,
        generated_subject = @generated_subject,
        generated_body = @generated_body
    WHERE id = @id
  `
    )
    .run({
      id,
      subject: data.subject ?? existing.subject,
      body: data.body ?? existing.body,
      generated_subject: data.generated_subject ?? existing.generated_subject,
      generated_body: data.generated_body ?? existing.generated_body,
    });

  return getProspect(id);
}

/**
 * WAL を含めた完全な状態を1ファイルに書き出す（バックアップ用）。
 *
 * fs.copyFileSync では -wal を置き去りにするため、WAL モードでは
 * 中身が空のファイルができてしまう（実測でテーブル数0）。
 * VACUUM INTO は SQLite がコミット済みの全データを整合した状態で書き出す。
 */
export function vacuumInto(destPath: string): void {
  getDb().prepare("VACUUM INTO ?").run(destPath);
}

export function getSetting(key: string): string | undefined {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function deleteAllProspects(): void {
  getDb().prepare("DELETE FROM prospects").run();
}

export function updateProspectStatus(id: number, status: string): Prospect | undefined {
  const instance = getDb();
  instance.prepare("UPDATE prospects SET send_status = ? WHERE id = ?").run(status, id);
  return getProspect(id);
}

export function findProspectByDomain(domain: string): Prospect | undefined {
  return getDb()
    .prepare("SELECT * FROM prospects WHERE domain = ? ORDER BY id DESC LIMIT 1")
    .get(domain) as Prospect | undefined;
}

export function getAllTemplates(): Template[] {
  return getDb()
    .prepare("SELECT * FROM templates ORDER BY id DESC")
    .all() as Template[];
}

export function getTemplate(id: number): Template | undefined {
  return getDb()
    .prepare("SELECT * FROM templates WHERE id = ?")
    .get(id) as Template | undefined;
}

export interface TemplateInput {
  name: string;
  subject: string;
  body: string;
  compose_mode?: ComposeMode;
  fixed_part?: string;
  ai_brief?: string;
  allow_attachments?: number;
}

export function createTemplate(data: TemplateInput): Template {
  const instance = getDb();
  const result = instance
    .prepare(
      `INSERT INTO templates (name, subject, body, compose_mode, fixed_part, ai_brief, allow_attachments)
       VALUES (@name, @subject, @body, @compose_mode, @fixed_part, @ai_brief, @allow_attachments)`
    )
    .run({
      name: data.name,
      subject: data.subject,
      body: data.body,
      compose_mode: data.compose_mode ?? "fixed_only",
      fixed_part: data.fixed_part ?? "",
      ai_brief: data.ai_brief ?? "",
      allow_attachments: data.allow_attachments ?? 0,
    });
  return getTemplate(Number(result.lastInsertRowid)) as Template;
}

export function updateTemplate(
  id: number,
  data: Partial<TemplateInput>
): Template | undefined {
  const instance = getDb();
  const existing = getTemplate(id);
  if (!existing) return undefined;
  instance
    .prepare(
      `UPDATE templates
       SET name = @name, subject = @subject, body = @body,
           compose_mode = @compose_mode, fixed_part = @fixed_part, ai_brief = @ai_brief,
           allow_attachments = @allow_attachments,
           updated_at = datetime('now','localtime')
       WHERE id = @id`
    )
    .run({
      id,
      name: data.name ?? existing.name,
      subject: data.subject ?? existing.subject,
      body: data.body ?? existing.body,
      compose_mode: data.compose_mode ?? existing.compose_mode,
      fixed_part: data.fixed_part ?? existing.fixed_part,
      ai_brief: data.ai_brief ?? existing.ai_brief,
      allow_attachments: data.allow_attachments ?? existing.allow_attachments,
    });
  return getTemplate(id);
}

export function deleteTemplate(id: number): boolean {
  const result = getDb().prepare("DELETE FROM templates WHERE id = ?").run(id);
  return result.changes > 0;
}

// --- Attachments ---

export function getAllAttachments(): Attachment[] {
  return getDb()
    .prepare("SELECT * FROM attachments ORDER BY created_at DESC, id DESC")
    .all() as Attachment[];
}

export function getAttachment(id: number): Attachment | undefined {
  return getDb()
    .prepare("SELECT * FROM attachments WHERE id = ?")
    .get(id) as Attachment | undefined;
}

export function createAttachment(data: {
  filename: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
}): Attachment {
  const result = getDb()
    .prepare(
      "INSERT INTO attachments (filename, stored_name, mime_type, size_bytes) VALUES (@filename, @stored_name, @mime_type, @size_bytes)"
    )
    .run(data);
  return getAttachment(Number(result.lastInsertRowid)) as Attachment;
}

export function deleteAttachment(id: number): boolean {
  const result = getDb().prepare("DELETE FROM attachments WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getTemplateAttachments(templateId: number): Attachment[] {
  return getDb()
    .prepare(
      `SELECT a.* FROM attachments a
       JOIN template_attachments ta ON ta.attachment_id = a.id
       WHERE ta.template_id = ?
       ORDER BY a.created_at DESC, a.id DESC`
    )
    .all(templateId) as Attachment[];
}

export function setTemplateAttachments(templateId: number, attachmentIds: number[]): Attachment[] {
  const instance = getDb();
  const replace = instance.transaction((ids: number[]) => {
    instance.prepare("DELETE FROM template_attachments WHERE template_id = ?").run(templateId);
    const insert = instance.prepare(
      "INSERT OR IGNORE INTO template_attachments (template_id, attachment_id) VALUES (?, ?)"
    );
    for (const attachmentId of ids) {
      insert.run(templateId, attachmentId);
    }
  });
  replace(attachmentIds);
  return getTemplateAttachments(templateId);
}

// --- Senders ---

export function getAllSenders(): Sender[] {
  return getDb()
    .prepare("SELECT * FROM senders ORDER BY id ASC")
    .all() as Sender[];
}

export function getSender(id: number): Sender | undefined {
  return getDb()
    .prepare("SELECT * FROM senders WHERE id = ?")
    .get(id) as Sender | undefined;
}

export function getSenderByEmail(email: string): Sender | undefined {
  return getDb()
    .prepare("SELECT * FROM senders WHERE email = ?")
    .get(email) as Sender | undefined;
}

export function upsertSender(data: {
  email: string;
  display_name: string;
  google_refresh_token_encrypted: string;
}): Sender {
  const instance = getDb();
  instance
    .prepare(
      `INSERT INTO senders (email, display_name, google_refresh_token_encrypted, auth_status)
       VALUES (@email, @display_name, @google_refresh_token_encrypted, 'connected')
       ON CONFLICT(email) DO UPDATE SET
         display_name = excluded.display_name,
         google_refresh_token_encrypted = excluded.google_refresh_token_encrypted,
         auth_status = 'connected'`
    )
    .run(data);
  return getSenderByEmail(data.email) as Sender;
}

export function updateSenderAuthStatus(id: number, status: SenderAuthStatus): void {
  getDb()
    .prepare("UPDATE senders SET auth_status = ? WHERE id = ?")
    .run(status, id);
}

export function updateSenderDailyLimit(id: number, dailyLimit: number): Sender | undefined {
  getDb()
    .prepare("UPDATE senders SET daily_limit = ? WHERE id = ?")
    .run(dailyLimit, id);
  return getSender(id);
}

export function updateSenderBooking(
  id: number,
  data: { booking_tool: BookingTool; booking_url: string }
): Sender | undefined {
  getDb()
    .prepare("UPDATE senders SET booking_tool = ?, booking_url = ? WHERE id = ?")
    .run(data.booking_tool, data.booking_url, id);
  return getSender(id);
}

export function deleteSender(id: number): boolean {
  const result = getDb().prepare("DELETE FROM senders WHERE id = ?").run(id);
  return result.changes > 0;
}

// --- Send Log (immutable — no update/delete) ---

export function createSendLog(data: {
  prospect_id: number;
  sender_id: number;
  to_email: string;
  subject: string;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
}): SendLog {
  const instance = getDb();
  const result = instance
    .prepare(
      `INSERT INTO send_log (prospect_id, sender_id, to_email, subject, gmail_message_id, gmail_thread_id)
       VALUES (@prospect_id, @sender_id, @to_email, @subject, @gmail_message_id, @gmail_thread_id)`
    )
    .run({
      prospect_id: data.prospect_id,
      sender_id: data.sender_id,
      to_email: data.to_email,
      subject: data.subject,
      gmail_message_id: data.gmail_message_id ?? null,
      gmail_thread_id: data.gmail_thread_id ?? null,
    });
  return instance
    .prepare("SELECT * FROM send_log WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as SendLog;
}

export function getSendLogByProspect(prospectId: number): SendLog[] {
  return getDb()
    .prepare("SELECT * FROM send_log WHERE prospect_id = ? ORDER BY sent_at DESC")
    .all(prospectId) as SendLog[];
}

export function getTodaySendCount(senderId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count FROM send_log
       WHERE sender_id = ? AND date(sent_at) = date('now','localtime')`
    )
    .get(senderId) as { count: number };
  return row.count;
}

// 要件書 F6-4: 同一メアドへ過去N日以内（デフォルト90日）の送信があればブロック
export const DUPLICATE_SEND_BLOCK_DAYS = 90;

export function hasSentToEmail(toEmail: string): boolean {
  // 大文字小文字・前後空白の違いでガードをすり抜けないよう、比較側も正規化する
  const row = getDb()
    .prepare(
      `SELECT id FROM send_log
       WHERE lower(trim(to_email)) = ?
         AND sent_at >= datetime('now', 'localtime', ?)
       LIMIT 1`
    )
    .get(normalizeEmailKey(toEmail), `-${DUPLICATE_SEND_BLOCK_DAYS} days`);
  return !!row;
}

// --- Companies / Contacts（F1: 企業リスト） ---

export interface CompanyInput {
  name: string;
  domain?: string | null;
  /** 収集経路。後で「この経路は反応が良い」を分析するため必ず記録する（仕様書F1） */
  source: string;
  source_detail?: string;
  hp_url?: string | null;
  lp_url?: string | null;
  recruit_page_url?: string | null;
}

export interface ContactInput {
  company_id?: number | null;
  company_name: string;
  person_name?: string;
  email: string;
  /** 公表アドレスであることの確認記録（特電法の例外要件の基礎・仕様書F2） */
  email_source_url?: string | null;
  source: string;
  lp_url?: string | null;
  notes?: string;
}

export function getAllCompanies(): Company[] {
  return getDb()
    .prepare("SELECT * FROM companies ORDER BY created_at DESC, id DESC")
    .all() as Company[];
}

export function getAllContacts(): Contact[] {
  return getDb()
    .prepare("SELECT * FROM contacts ORDER BY created_at DESC, id DESC")
    .all() as Contact[];
}

/**
 * 同一ドメインは重複登録しない（仕様書F1）。
 * ドメインが無い（手動追加など）場合は名前で重複を避ける。
 */
export function upsertCompany(data: CompanyInput): Company {
  const instance = getDb();
  const domain = data.domain?.toLowerCase().replace(/^www\./, "") || null;

  if (domain) {
    const existing = instance
      .prepare("SELECT * FROM companies WHERE domain = ?")
      .get(domain) as Company | undefined;
    if (existing) return existing;
  } else {
    const existing = instance
      .prepare("SELECT * FROM companies WHERE domain IS NULL AND name = ?")
      .get(data.name) as Company | undefined;
    if (existing) return existing;
  }

  const result = instance
    .prepare(
      `INSERT INTO companies (name, domain, source, source_detail, hp_url, lp_url, recruit_page_url)
       VALUES (@name, @domain, @source, @source_detail, @hp_url, @lp_url, @recruit_page_url)`
    )
    .run({
      name: data.name,
      domain,
      source: data.source,
      source_detail: data.source_detail ?? "",
      hp_url: data.hp_url ?? null,
      lp_url: data.lp_url ?? null,
      recruit_page_url: data.recruit_page_url ?? null,
    });

  return instance
    .prepare("SELECT * FROM companies WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Company;
}

/** メールアドレスで重複排除する。既存があれば上書きせずそのまま返す */
export function upsertContact(data: ContactInput): Contact {
  const instance = getDb();
  const email = normalizeEmailKey(data.email);

  const existing = instance
    .prepare("SELECT * FROM contacts WHERE email = ?")
    .get(email) as Contact | undefined;
  if (existing) return existing;

  const result = instance
    .prepare(
      `INSERT INTO contacts (company_id, company_name, person_name, email, email_source_url, source, lp_url, notes)
       VALUES (@company_id, @company_name, @person_name, @email, @email_source_url, @source, @lp_url, @notes)`
    )
    .run({
      company_id: data.company_id ?? null,
      company_name: data.company_name,
      person_name: data.person_name ?? "",
      email,
      email_source_url: data.email_source_url ?? null,
      source: data.source,
      lp_url: data.lp_url ?? null,
      notes: data.notes ?? "",
    });

  return instance
    .prepare("SELECT * FROM contacts WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as Contact;
}

/** F4/F9: 宛先メールから登録済みの連絡先を引く */
export function getContactByEmail(email: string): Contact | undefined {
  return getDb()
    .prepare("SELECT * FROM contacts WHERE email = ?")
    .get(normalizeEmailKey(email)) as Contact | undefined;
}

export function deleteCompany(id: number): boolean {
  return getDb().prepare("DELETE FROM companies WHERE id = ?").run(id).changes > 0;
}

export function deleteContact(id: number): boolean {
  return getDb().prepare("DELETE FROM contacts WHERE id = ?").run(id).changes > 0;
}

// --- Suppressions ---

export function getAllSuppressions(): Suppression[] {
  return getDb()
    .prepare("SELECT * FROM suppressions ORDER BY created_at DESC")
    .all() as Suppression[];
}

export function addSuppression(data: {
  target: string;
  target_type: SuppressionTargetType;
  reason: SuppressionReason;
  note?: string;
}): Suppression {
  const instance = getDb();
  instance
    .prepare(
      `INSERT OR IGNORE INTO suppressions (target, target_type, reason, note)
       VALUES (@target, @target_type, @reason, @note)`
    )
    .run({
      target: normalizeEmailKey(data.target).replace(/^@/, ""),
      target_type: data.target_type,
      reason: data.reason,
      note: data.note ?? "",
    });
  return instance
    .prepare("SELECT * FROM suppressions WHERE target = ? AND target_type = ?")
    .get(data.target.toLowerCase(), data.target_type) as Suppression;
}

/**
 * 抑止リスト・送信ログの照合キー。
 * trim を欠くと " a@example.com " のような値が法定チェックをすり抜ける
 * （メール送信側は前後空白を除去して配信するため、実際には届いてしまう）。
 */
export function normalizeEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailSuppressed(email: string): Suppression | null {
  const emailLower = normalizeEmailKey(email);
  const domain = emailLower.split("@")[1];

  const emailMatch = getDb()
    .prepare("SELECT * FROM suppressions WHERE target = ? AND target_type = 'email'")
    .get(emailLower) as Suppression | undefined;
  if (emailMatch) return emailMatch;

  const domainMatch = getDb()
    .prepare("SELECT * FROM suppressions WHERE target = ? AND target_type = 'domain'")
    .get(domain) as Suppression | undefined;
  if (domainMatch) return domainMatch;

  return null;
}

export function deleteSuppression(id: number): boolean {
  const result = getDb().prepare("DELETE FROM suppressions WHERE id = ?").run(id);
  return result.changes > 0;
}
