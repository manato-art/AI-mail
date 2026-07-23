import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type {
  CompanyWithTag,
  Attachment,
  BookingTool,
  CollectionPauseKind,
  CollectionRun,
  CollectionRunStatus,
  CollectionSource,
  CollectionSourceType,
  Company,
  ComposeMode,
  Contact,
  FitScore,
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

    CREATE TABLE IF NOT EXISTS collection_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      site TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      next_page INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      consecutive_no_result_runs INTEGER NOT NULL DEFAULT 0,
      consecutive_no_new_runs INTEGER NOT NULL DEFAULT 0,
      paused_reason TEXT NOT NULL DEFAULT '',
      paused_kind TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      UNIQUE(keyword, site)
    );

    CREATE TABLE IF NOT EXISTS collection_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES collection_sources(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      page_from INTEGER NOT NULL DEFAULT 0,
      found_count INTEGER NOT NULL DEFAULT 0,
      new_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      skip_breakdown TEXT NOT NULL DEFAULT '',
      error TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_collection_runs_source
      ON collection_runs(source_id, started_at DESC);
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
  // 生成元テンプレートの記録。テンプレ由来のメールは品質チェックの文字数・構成チェックを外す
  addColumnIfMissing(instance, "prospects", "template_id", "INTEGER");

  // 予約送信: 予定時刻・送信者・宛先を持たせ、時刻到来でスケジューラが送る
  addColumnIfMissing(instance, "prospects", "scheduled_at", "TEXT");
  addColumnIfMissing(instance, "prospects", "scheduled_sender_id", "INTEGER");
  addColumnIfMissing(instance, "prospects", "scheduled_to_email", "TEXT");
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

  // 収集した企業を「送れる状態」にするまでの裏処理（F1: クロール→連絡先→相性スコア）の進捗。
  // pending のまま溜まっている件数が、そのまま在庫の目詰まりを表す。
  addColumnIfMissing(instance, "companies", "enrichment_status", "TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing(instance, "companies", "enriched_at", "TEXT");
  addColumnIfMissing(instance, "companies", "enrichment_error", "TEXT NOT NULL DEFAULT ''");
  // データ整合（HP再クロールで社名照合）を最後に行った時刻。同じ企業を毎tick再クロールしないための間引きに使う
  addColumnIfMissing(instance, "companies", "integrity_checked_at", "TEXT");
  // F3 相性スコア。どの商材に対するスコアかを持たないと、商材を変えた後に古い判定が残る
  addColumnIfMissing(instance, "companies", "fit_score", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(instance, "companies", "fit_reason", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(instance, "companies", "fit_service_id", "INTEGER");
  addColumnIfMissing(instance, "companies", "business_summary", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(instance, "companies", "analysis_json", "TEXT NOT NULL DEFAULT '{}'");

  // Wantedly直接スクレイピング対応: 収集元の種別を区別する
  addColumnIfMissing(instance, "collection_sources", "source_type", "TEXT NOT NULL DEFAULT 'keyword_search'");

  // 貼り付けたWantedly検索URLから収集するソース用に、収集元URLを持たせる
  addColumnIfMissing(instance, "collection_sources", "url", "TEXT");

  // F1 タグ付け: どのキーワード・どの商材向けに集めたかで後から絞り込む
  addColumnIfMissing(instance, "collection_sources", "service_id", "INTEGER");
  addColumnIfMissing(instance, "companies", "collection_source_id", "INTEGER");

  // send_log の check-then-act race 対策: gmail_message_id が同じレコードの二重挿入を防ぐ
  instance.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_send_log_gmail_message_id
    ON send_log (gmail_message_id) WHERE gmail_message_id IS NOT NULL
  `);

  // #7 並行二重送信対策: 送信直前に宛先メールを原子的にクレームするための一時テーブル。
  // 送信の「進行中」を横断リクエストに見せて、同一宛先の同時送信を1件に絞る。
  instance.exec(`
    CREATE TABLE IF NOT EXISTS send_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_send_claims_email ON send_claims (email);
  `);
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
  data: Omit<
    Prospect,
    "id" | "created_at" | "template_id" | "scheduled_at" | "scheduled_sender_id" | "scheduled_to_email"
  > & { template_id?: number | null }
): Prospect {
  const instance = getDb();
  const result = instance
    .prepare(
      `
    INSERT INTO prospects (
      input_url, domain, company_name, analysis_json, service_id, persona_id,
      subject, body, generated_subject, generated_body, emails_found_json,
      form_url, is_form_only, compatibility_score, has_refusal, refusal_text, template_id
    ) VALUES (
      @input_url, @domain, @company_name, @analysis_json, @service_id, @persona_id,
      @subject, @body, @generated_subject, @generated_body, @emails_found_json,
      @form_url, @is_form_only, @compatibility_score, @has_refusal, @refusal_text, @template_id
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
      template_id: data.template_id ?? null,
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

/**
 * F14: 予約完了Webhookから宛先メールで prospect を引く。
 * emails_found_json はJSON配列なので、送信ログ側の宛先も併せて照合する。
 */
export function getProspectsByEmail(email: string): Prospect[] {
  const key = normalizeEmailKey(email);
  return getDb()
    .prepare(
      `SELECT p.* FROM prospects p
       WHERE EXISTS (
         SELECT 1 FROM send_log s
         WHERE s.prospect_id = p.id AND lower(trim(s.to_email)) = ?
       )
       OR lower(p.emails_found_json) LIKE ?`
    )
    .all(key, `%"${key}"%`) as Prospect[];
}

export function updateProspectStatus(id: number, status: string): Prospect | undefined {
  const instance = getDb();
  instance.prepare("UPDATE prospects SET send_status = ? WHERE id = ?").run(status, id);
  return getProspect(id);
}

/**
 * prospect を予約送信状態にする。最終的な送信本文(subject/body)・送信者・宛先・予定時刻を
 * 併せて確定させ、時刻到来時にスケジューラがこの内容でそのまま送る。
 */
export function scheduleProspect(
  id: number,
  data: { scheduledAt: string; senderId: number; toEmail: string; subject: string; body: string }
): Prospect | undefined {
  getDb()
    .prepare(
      `UPDATE prospects
       SET send_status = 'scheduled',
           scheduled_at = @scheduledAt,
           scheduled_sender_id = @senderId,
           scheduled_to_email = @toEmail,
           subject = @subject,
           body = @body
       WHERE id = @id`
    )
    .run({ id, scheduledAt: data.scheduledAt, senderId: data.senderId, toEmail: data.toEmail, subject: data.subject, body: data.body });
  return getProspect(id);
}

/**
 * 予定時刻が到来した予約prospectを取り出す（古い予約から順に）。
 * scheduled_at は UTC の 'YYYY-MM-DD HH:MM:SS' で保存されるので UTC の now と比較する
 * （サーバのタイムゾーンに依存させない）。
 */
export function getDueScheduledProspects(limit: number): Prospect[] {
  return getDb()
    .prepare(
      `SELECT * FROM prospects
       WHERE send_status = 'scheduled'
         AND scheduled_at IS NOT NULL
         AND scheduled_at <= datetime('now')
       ORDER BY scheduled_at ASC, id ASC
       LIMIT ?`
    )
    .all(limit) as Prospect[];
}

/** 予約中（未送信の予約）の一覧。予約一覧UI用に予定の近い順で返す */
export function getScheduledProspects(): Prospect[] {
  return getDb()
    .prepare(
      `SELECT * FROM prospects
       WHERE send_status = 'scheduled'
       ORDER BY scheduled_at ASC, id ASC`
    )
    .all() as Prospect[];
}

/** 予約を取り消す（未送信に戻し、予約情報をクリア）。既に送信/送信中でなければ true */
export function cancelScheduledProspect(id: number): boolean {
  const result = getDb()
    .prepare(
      `UPDATE prospects
       SET send_status = 'unsent', scheduled_at = NULL, scheduled_sender_id = NULL, scheduled_to_email = NULL
       WHERE id = ? AND send_status = 'scheduled'`
    )
    .run(id);
  return result.changes > 0;
}

/**
 * 送信直前の排他クレーム（二重送信防止）。
 * send_status が未送信系（unsent/failed）の時だけ 'sending' に条件付き更新する。
 * 別リクエストが先に 'sending'/'sent' へ遷移させていたら changes=0 で claimed:false を返す。
 * これにより「読んでから送るまで」の隙での二重送信を DB レベルで1件に絞る。
 */
export function claimProspectForSending(id: number): boolean {
  const result = getDb()
    .prepare(
      "UPDATE prospects SET send_status = 'sending' WHERE id = ? AND send_status IN ('unsent', 'failed')"
    )
    .run(id);
  return result.changes > 0;
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

// クレームが「進行中」とみなす上限。これ以上前の claim は死んだリクエストの残骸として無視する。
export const SEND_CLAIM_STALE_MINUTES = 10;

/**
 * 送信直前の「宛先メール」単位のアトミックなクレーム（#7 並行二重送信防止）。
 *
 * 二重送信ガード hasSentToEmail は「SELECT してから送信・記録」までに await を挟むため、
 * 同一宛先への同時リクエストが両方 SELECT を通過して二重送信になり得る。
 * better-sqlite3 は同期実行なので、この関数の transaction は他リクエストと割り込みなく
 * 原子的に走る。進行中クレームが無ければ1件入れて claimId を返し、あれば null を返す。
 *
 * 返った claimId は送信の成否に関わらず releaseEmailClaim で必ず解放すること。
 * プロセスが落ちても SEND_CLAIM_STALE_MINUTES 経過後は自動的に無効化される。
 * 90日の重複判定は含めない（それは hasSentToEmail / 送信ガード側の責務。単発送信の
 * 意図的な再送を殺さないため、ここは「同時実行の抑止」だけに限定する）。
 */
export function claimEmailForSend(toEmail: string): number | null {
  const instance = getDb();
  const key = normalizeEmailKey(toEmail);
  const tx = instance.transaction((email: string): number | null => {
    // 落ちたリクエストが残した古いクレームを掃除（テーブルの無限増加を防ぐ）
    instance
      .prepare(`DELETE FROM send_claims WHERE created_at < datetime('now','localtime', ?)`)
      .run(`-${SEND_CLAIM_STALE_MINUTES} minutes`);
    const live = instance
      .prepare("SELECT id FROM send_claims WHERE email = ? LIMIT 1")
      .get(email);
    if (live) return null;
    const res = instance.prepare("INSERT INTO send_claims (email) VALUES (?)").run(email);
    return Number(res.lastInsertRowid);
  });
  return tx(key);
}

/** 送信処理の完了・失敗時にクレームを解放する（多重解放・存在しないIDでも安全） */
export function releaseEmailClaim(claimId: number): void {
  getDb().prepare("DELETE FROM send_claims WHERE id = ?").run(claimId);
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
  /** F1 タグ付け: どの収集キーワード（=collection_sources）由来かの構造化リンク */
  collection_source_id?: number | null;
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

/**
 * F1 タグ付け: 企業に「収集キーワード」「商材名」を JOIN で付けて返す。
 * 企業一覧の絞り込み（キーワード別・商材別）に使う。
 */
export function getCompaniesWithTags(): CompanyWithTag[] {
  return getDb()
    .prepare(
      `SELECT c.*,
              cs.keyword     AS collection_keyword,
              cs.service_id  AS collection_service_id,
              s.name         AS collection_service_name
       FROM companies c
       LEFT JOIN collection_sources cs ON c.collection_source_id = cs.id
       LEFT JOIN services s ON cs.service_id = s.id
       ORDER BY c.created_at DESC, c.id DESC`
    )
    .all() as CompanyWithTag[];
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
      `INSERT INTO companies (name, domain, source, source_detail, hp_url, lp_url, recruit_page_url, collection_source_id)
       VALUES (@name, @domain, @source, @source_detail, @hp_url, @lp_url, @recruit_page_url, @collection_source_id)`
    )
    .run({
      name: data.name,
      domain,
      source: data.source,
      source_detail: data.source_detail ?? "",
      hp_url: data.hp_url ?? null,
      lp_url: data.lp_url ?? null,
      recruit_page_url: data.recruit_page_url ?? null,
      collection_source_id: data.collection_source_id ?? null,
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

export interface ImportRow {
  name: string;
  domain?: string | null;
  hp_url?: string | null;
  recruit_page_url?: string | null;
  lp_url?: string | null;
  email?: string | null;
  person_name?: string | null;
  email_source_url?: string | null;
}

export interface ImportResult {
  companiesAdded: number;
  contactsAdded: number;
  skipped: number;
}

const IMPORT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * CSV取込・キーワード検索結果の企業＋連絡先を一括登録する（仕様書F1/F8）。
 *
 * 全行を単一トランザクションで処理する。1行が途中で失敗しても全体を
 * ロールバックし、部分登録（企業だけ入って連絡先が入らない、途中まで入る）を
 * 残さない。1件ごとの暗黙コミット(fsync)もまとまるため大量行でも速い。
 */
export function importCompaniesWithContacts(
  rows: ImportRow[],
  source: string,
  sourceDetail: string
): ImportResult {
  const instance = getDb();

  const run = instance.transaction((): ImportResult => {
    let companiesAdded = 0;
    let contactsAdded = 0;
    let skipped = 0;

    const seenCompanies = new Set(
      (instance.prepare("SELECT id FROM companies").all() as Array<{ id: number }>).map((c) => c.id)
    );
    const seenContacts = new Set(
      (instance.prepare("SELECT id FROM contacts").all() as Array<{ id: number }>).map((c) => c.id)
    );

    for (const row of rows) {
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) { skipped++; continue; }

      const company = upsertCompany({
        name,
        domain: typeof row.domain === "string" ? row.domain.trim() : null,
        source,
        source_detail: sourceDetail,
        hp_url: typeof row.hp_url === "string" ? row.hp_url : null,
        recruit_page_url: typeof row.recruit_page_url === "string" ? row.recruit_page_url : null,
        lp_url: typeof row.lp_url === "string" ? row.lp_url : null,
      });
      if (!seenCompanies.has(company.id)) {
        seenCompanies.add(company.id);
        companiesAdded++;
      }

      const email = typeof row.email === "string" ? row.email.trim() : "";
      if (!email || !IMPORT_EMAIL_PATTERN.test(email)) continue;

      const contact = upsertContact({
        company_id: company.id,
        company_name: name,
        person_name: typeof row.person_name === "string" ? row.person_name : "",
        email,
        email_source_url:
          typeof row.email_source_url === "string" ? row.email_source_url : row.hp_url ?? null,
        source,
        lp_url: typeof row.lp_url === "string" ? row.lp_url : null,
      });
      if (!seenContacts.has(contact.id)) {
        seenContacts.add(contact.id);
        contactsAdded++;
      }
    }

    return { companiesAdded, contactsAdded, skipped };
  });

  return run();
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

// --- Collection（F1: 常時収集して在庫として持つ） ---

/**
 * 収集ジョブの多重起動を防ぐロック。
 * アプリ内スケジューラと外部cronの両方から起動されうるため、
 * 「読んでから書く」ではなく1文のUPSERTで原子的に取る。
 * TTLを持たせてあるので、途中でプロセスが落ちてもロックは自然に外れる。
 */
export function tryAcquireJobLock(key: string, ttlMinutes: number): boolean {
  // datetime() は不正な修飾子に NULL を返す。そのまま INSERT すると
  // NOT NULL 制約で落ち、原因の分かりにくいエラーになる
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 1) {
    throw new Error(`ロックのTTLが不正です: ${ttlMinutes}`);
  }

  const result = getDb()
    .prepare(
      `INSERT INTO settings (key, value)
       VALUES (@key, datetime('now','localtime', @ttl))
       ON CONFLICT(key) DO UPDATE SET value = datetime('now','localtime', @ttl)
       WHERE settings.value <= datetime('now','localtime')`
    )
    .run({ key, ttl: `+${ttlMinutes} minutes` });
  return result.changes > 0;
}

export function releaseJobLock(key: string): void {
  getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
}

/** 実行中かどうかの読み取り専用チェック。実際の排他は tryAcquireJobLock が行う */
export function isJobLocked(key: string): boolean {
  const row = getDb()
    .prepare(
      "SELECT value FROM settings WHERE key = ? AND value > datetime('now','localtime')"
    )
    .get(key) as { value: string } | undefined;
  return !!row;
}

/** 前回実行から指定時間が経過したか。再起動でタイマーが巻き戻っても二重実行しない */
export function hasIntervalElapsed(key: string, hours: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT value FROM settings
       WHERE key = @key AND value > datetime('now','localtime', @ago)`
    )
    .get({ key, ago: `-${hours} hours` }) as { value: string } | undefined;
  return !row;
}

/** メールアドレスからドメイン部を取り出すSQL片。LIKE を使うとドメイン中の % で誤爆する */
const EMAIL_DOMAIN_SQL = "lower(trim(substr(to_email, instr(to_email, '@') + 1)))";

export function getAllCollectionSources(): CollectionSource[] {
  return getDb()
    .prepare("SELECT * FROM collection_sources ORDER BY created_at DESC, id DESC")
    .all() as CollectionSource[];
}

/** 実行対象。停止中（paused_kind が空でない）は自動実行から外す */
export function getRunnableCollectionSources(): CollectionSource[] {
  return getDb()
    .prepare(
      `SELECT * FROM collection_sources
       WHERE is_active = 1 AND paused_kind = ''
       ORDER BY COALESCE(last_run_at, '') ASC, id ASC`
    )
    .all() as CollectionSource[];
}

export function getCollectionSource(id: number): CollectionSource | undefined {
  return getDb()
    .prepare("SELECT * FROM collection_sources WHERE id = ?")
    .get(id) as CollectionSource | undefined;
}

export function createCollectionSource(
  keyword: string,
  site: string,
  sourceType: CollectionSourceType = "keyword_search",
  serviceId: number | null = null
): CollectionSource {
  const instance = getDb();
  instance
    .prepare(
      "INSERT OR IGNORE INTO collection_sources (keyword, site, source_type, service_id) VALUES (@keyword, @site, @sourceType, @serviceId)"
    )
    .run({ keyword, site, sourceType, serviceId });
  // 既存キーワードに後から商材を紐付け直せるよう、指定があれば更新する
  if (serviceId !== null) {
    instance
      .prepare("UPDATE collection_sources SET service_id = ? WHERE keyword = ? AND site = ?")
      .run(serviceId, keyword, site);
  }
  return instance
    .prepare("SELECT * FROM collection_sources WHERE keyword = ? AND site = ?")
    .get(keyword, site) as CollectionSource;
}

export function deleteCollectionSource(id: number): boolean {
  return getDb().prepare("DELETE FROM collection_sources WHERE id = ?").run(id).changes > 0;
}

/** URL からタグ用の短い一意ラベルを作る（乱数不使用の決定的ハッシュ） */
function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 6);
}

/**
 * 貼り付けられた Wantedly 検索URLを収集ソースとして登録する。
 * 同じURLは1件に集約する。keyword は企業タグにも出るので短いラベルにし、
 * 実URLは url 列に持たせる。
 */
export function createWantedlyUrlSource(
  url: string,
  serviceId: number | null = null
): CollectionSource {
  const instance = getDb();
  const existing = instance
    .prepare("SELECT * FROM collection_sources WHERE url = ?")
    .get(url) as CollectionSource | undefined;
  if (existing) {
    if (serviceId !== null) {
      instance.prepare("UPDATE collection_sources SET service_id = ? WHERE id = ?").run(serviceId, existing.id);
    }
    return instance.prepare("SELECT * FROM collection_sources WHERE id = ?").get(existing.id) as CollectionSource;
  }
  const keyword = `Wantedly:${shortHash(url)}`;
  instance
    .prepare(
      "INSERT INTO collection_sources (keyword, site, source_type, service_id, url) VALUES (?, 'wantedly.com', 'wantedly_url', ?, ?)"
    )
    .run(keyword, serviceId, url);
  return instance.prepare("SELECT * FROM collection_sources WHERE url = ?").get(url) as CollectionSource;
}

export function setCollectionSourceActive(id: number, isActive: boolean): void {
  getDb()
    .prepare("UPDATE collection_sources SET is_active = ? WHERE id = ?")
    .run(isActive ? 1 : 0, id);
}

/** 実行時にAIが検索元サイトを決めた場合、次回以降そのサイトを使い回す */
export function setCollectionSourceSite(id: number, site: string): void {
  getDb().prepare("UPDATE collection_sources SET site = ? WHERE id = ?").run(site, id);
}

export interface CollectionCursorUpdate {
  nextPage: number;
  consecutiveNoResultRuns: number;
  consecutiveNoNewRuns: number;
}

export function updateCollectionCursor(id: number, update: CollectionCursorUpdate): void {
  getDb()
    .prepare(
      `UPDATE collection_sources
       SET next_page = @nextPage,
           consecutive_no_result_runs = @noResult,
           consecutive_no_new_runs = @noNew,
           last_run_at = datetime('now','localtime')
       WHERE id = @id`
    )
    .run({
      id,
      nextPage: update.nextPage,
      noResult: update.consecutiveNoResultRuns,
      noNew: update.consecutiveNoNewRuns,
    });
}

export function pauseCollectionSource(
  id: number,
  kind: Exclude<CollectionPauseKind, "">,
  reason: string
): void {
  getDb()
    .prepare("UPDATE collection_sources SET paused_kind = ?, paused_reason = ? WHERE id = ?")
    .run(kind, reason, id);
}

/** 停止解除。連続カウンタも戻さないと、次の1回でまた止まる */
export function resumeCollectionSource(id: number): void {
  getDb()
    .prepare(
      `UPDATE collection_sources
       SET paused_kind = '', paused_reason = '',
           consecutive_no_result_runs = 0, consecutive_no_new_runs = 0
       WHERE id = ?`
    )
    .run(id);
}

export function startCollectionRun(sourceId: number, pageFrom: number): number {
  const result = getDb()
    .prepare(
      `INSERT INTO collection_runs (source_id, status, page_from)
       VALUES (?, 'error', ?)`
    )
    .run(sourceId, pageFrom);
  return Number(result.lastInsertRowid);
}

export interface CollectionRunResult {
  status: CollectionRunStatus;
  foundCount: number;
  newCount: number;
  skippedCount: number;
  skipBreakdown: Record<string, number>;
  error?: string;
}

export function finishCollectionRun(runId: number, result: CollectionRunResult): void {
  getDb()
    .prepare(
      `UPDATE collection_runs
       SET status = @status, found_count = @found, new_count = @new,
           skipped_count = @skipped, skip_breakdown = @breakdown, error = @error,
           finished_at = datetime('now','localtime')
       WHERE id = @id`
    )
    .run({
      id: runId,
      status: result.status,
      found: result.foundCount,
      new: result.newCount,
      skipped: result.skippedCount,
      breakdown: JSON.stringify(result.skipBreakdown),
      error: result.error ?? "",
    });
}

export function getRecentCollectionRuns(limit: number = 30): CollectionRun[] {
  return getDb()
    .prepare("SELECT * FROM collection_runs ORDER BY started_at DESC, id DESC LIMIT ?")
    .all(limit) as CollectionRun[];
}

/**
 * ドメイン別の通算送信数（send_log 基準の実送信回数）。
 * 履歴の各行に「この会社へ通算◯通」を出すために、ドメイン→件数の辞書で返す。
 */
export function getSendCountsByDomain(): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT ${EMAIL_DOMAIN_SQL} as domain, COUNT(*) as count
       FROM send_log
       WHERE to_email IS NOT NULL AND instr(to_email, '@') > 0
       GROUP BY ${EMAIL_DOMAIN_SQL}`
    )
    .all() as { domain: string; count: number }[];
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (r.domain) map[r.domain] = r.count;
  }
  return map;
}

/** これまでに生成した prospect のドメイン一覧（重複排除）。生成ページの「生成状態」フィルタに使う */
export function getDistinctProspectDomains(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT domain FROM prospects WHERE domain IS NOT NULL AND domain != ''")
    .all() as { domain: string }[];
  return rows.map((r) => r.domain);
}

/** 重複排除: このドメイン宛に一度でも送信していれば、収集し直さない */
export function hasSentToDomain(domain: string): boolean {
  const row = getDb()
    .prepare(`SELECT id FROM send_log WHERE ${EMAIL_DOMAIN_SQL} = ? LIMIT 1`)
    .get(domain.trim().toLowerCase().replace(/^www\./, ""));
  return !!row;
}

/** 重複排除: 抑止リスト（配信停止・既存顧客のドメイン登録を含む）に載っているか */
export function isDomainSuppressed(domain: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM suppressions WHERE target = ? AND target_type = 'domain' LIMIT 1")
    .get(domain.trim().toLowerCase().replace(/^www\./, ""));
  return !!row;
}

/**
 * 収集時点では企業名しか分からないため、名前で既知かどうかを見る。
 * ドメインでの照合は裏処理でHPを解決した後（lib/enrichment.ts）に行う。
 */
export function findCompanyByName(name: string): Company | undefined {
  return getDb()
    .prepare("SELECT * FROM companies WHERE name = ? LIMIT 1")
    .get(name.trim()) as Company | undefined;
}

/** 同名の企業が何社あるか。同名多数（同名異企業）を検知して分析の取り違えを防ぐのに使う */
export function countCompaniesByName(name: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM companies WHERE name = ?")
    .get(name.trim()) as { count: number };
  return row.count;
}

export function getCompanyById(id: number): Company | undefined {
  return getDb()
    .prepare("SELECT * FROM companies WHERE id = ?")
    .get(id) as Company | undefined;
}

export function updateCompanyHpUrl(id: number, hpUrl: string): Company | undefined {
  const domain = (() => {
    try { return new URL(hpUrl).hostname.replace(/^www\./, ""); } catch { return null; }
  })();
  getDb()
    .prepare(
      `UPDATE companies SET hp_url = @hp_url, domain = COALESCE(domain, @domain)
       WHERE id = @id`
    )
    .run({ id, hp_url: hpUrl, domain });
  return getCompanyById(id);
}

export function findCompanyByDomain(domain: string): Company | undefined {
  return getDb()
    .prepare("SELECT * FROM companies WHERE domain = ? LIMIT 1")
    .get(domain.trim().toLowerCase().replace(/^www\./, "")) as Company | undefined;
}

/** 同一ドメインに紐づく企業が何社あるか。共有ドメイン（グループ会社・レンタルサーバ等）の検知に使う */
export function countCompaniesByDomain(domain: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM companies WHERE domain = ?")
    .get(domain.trim().toLowerCase().replace(/^www\./, "")) as { count: number };
  return row.count;
}

export function setCompanyDomain(id: number, domain: string): void {
  getDb()
    .prepare("UPDATE companies SET domain = ? WHERE id = ?")
    .run(domain.trim().toLowerCase().replace(/^www\./, ""), id);
}

/** 送信済み・抑止対象・既登録と判明した企業を在庫から外す。理由は必ず残す */
export function markCompanyExcluded(id: number, reason: string): void {
  getDb()
    .prepare(
      `UPDATE companies
       SET enrichment_status = 'excluded', enrichment_error = ?,
           enriched_at = datetime('now','localtime')
       WHERE id = ?`
    )
    .run(reason.slice(0, 500), id);
}

export function getCompaniesPendingEnrichment(limit: number): Company[] {
  return getDb()
    .prepare(
      `SELECT * FROM companies
       WHERE enrichment_status = 'pending'
       ORDER BY created_at ASC, id ASC
       LIMIT ?`
    )
    .all(limit) as Company[];
}

/** 未処理（準備中）の企業数。バックログを手動で調査する導線の件数表示・上限判定に使う */
export function countCompaniesPendingEnrichment(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM companies WHERE enrichment_status = 'pending'")
    .get() as { count: number };
  return row.count;
}

export interface CompanyEnrichmentUpdate {
  hp_url?: string | null;
  recruit_page_url?: string | null;
  business_summary?: string;
  fit_score?: FitScore;
  fit_reason?: string;
  fit_service_id?: number | null;
  analysis_json?: string;
}

export function markCompanyEnriched(id: number, update: CompanyEnrichmentUpdate): void {
  const current = getCompanyById(id);
  if (!current) return;

  getDb()
    .prepare(
      `UPDATE companies
       SET hp_url = @hp_url, recruit_page_url = @recruit_page_url,
           business_summary = @business_summary, fit_score = @fit_score,
           fit_reason = @fit_reason, fit_service_id = @fit_service_id,
           analysis_json = @analysis_json,
           enrichment_status = 'done', enrichment_error = '',
           enriched_at = datetime('now','localtime')
       WHERE id = @id`
    )
    .run({
      id,
      hp_url: update.hp_url ?? current.hp_url,
      recruit_page_url: update.recruit_page_url ?? current.recruit_page_url,
      business_summary: update.business_summary ?? current.business_summary,
      fit_score: update.fit_score ?? current.fit_score,
      fit_reason: update.fit_reason ?? current.fit_reason,
      fit_service_id: update.fit_service_id ?? current.fit_service_id,
      analysis_json: update.analysis_json ?? current.analysis_json,
    });
}

/** 失敗は握り潰さず理由を残す。画面に出して人が気づけるようにするため */
export function markCompanyEnrichmentFailed(id: number, error: string): void {
  getDb()
    .prepare(
      `UPDATE companies
       SET enrichment_status = 'failed', enrichment_error = ?,
           enriched_at = datetime('now','localtime')
       WHERE id = ?`
    )
    .run(error.slice(0, 500), id);
}

/**
 * 調査に失敗した企業を裏処理の待ち行列に戻す。検索APIの一時的な不調で
 * まとめて失敗することがあるため、1社ずつではなく一括で戻せるようにする。
 * excluded（送信済み・抑止対象）は意図的に対象外。戻すと在庫に混ざる。
 */
export function resetFailedEnrichments(): number {
  return getDb()
    .prepare(
      `UPDATE companies
       SET enrichment_status = 'pending', enrichment_error = ''
       WHERE enrichment_status = 'failed'`
    )
    .run().changes;
}

/**
 * 調査完了だがメールが見つからなかった企業を再調査キューに戻す。
 * contacts にメールを持つ行が無い企業だけが対象。
 */
export function resetEnrichedWithoutEmail(): number {
  return getDb()
    .prepare(
      `UPDATE companies
       SET enrichment_status = 'pending', enrichment_error = ''
       WHERE enrichment_status = 'done'
         AND id NOT IN (
           SELECT DISTINCT company_id FROM contacts
           WHERE email IS NOT NULL AND email != ''
         )`
    )
    .run().changes;
}

/** 整合チェックの再確認間隔（日）。一度確認した企業はこの期間は再クロールしない */
const INTEGRITY_RECHECK_DAYS = 30;

/**
 * データ整合チェックの対象企業を返す。
 * 「調査完了・HP有・連絡先メール有」でありながら、まだ整合確認していない
 * （または再確認期限を過ぎた）企業を、未確認→古い確認順に返す。
 * HP再クロールで「登録社名がそのHPに現れるか」を照合するために使う。
 */
export function getCompaniesForIntegrityCheck(limit: number): Company[] {
  return getDb()
    .prepare(
      `SELECT c.* FROM companies c
       WHERE c.enrichment_status = 'done'
         AND c.hp_url IS NOT NULL AND c.hp_url != ''
         AND EXISTS (
           SELECT 1 FROM contacts ct
           WHERE ct.company_id = c.id AND ct.email IS NOT NULL AND ct.email != ''
         )
         AND (
           c.integrity_checked_at IS NULL
           OR c.integrity_checked_at < datetime('now', 'localtime', '-${INTEGRITY_RECHECK_DAYS} days')
         )
       ORDER BY (c.integrity_checked_at IS NOT NULL), c.integrity_checked_at ASC, c.id ASC
       LIMIT ?`
    )
    .all(limit) as Company[];
}

/** 整合チェックの対象企業数（手動導線の件数表示に使う） */
export function countCompaniesForIntegrityCheck(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count FROM companies c
       WHERE c.enrichment_status = 'done'
         AND c.hp_url IS NOT NULL AND c.hp_url != ''
         AND EXISTS (
           SELECT 1 FROM contacts ct
           WHERE ct.company_id = c.id AND ct.email IS NOT NULL AND ct.email != ''
         )
         AND (
           c.integrity_checked_at IS NULL
           OR c.integrity_checked_at < datetime('now', 'localtime', '-${INTEGRITY_RECHECK_DAYS} days')
         )`
    )
    .get() as { count: number };
  return row.count;
}

/** 整合チェックで問題なしだった企業の確認時刻を更新（次の再確認期限まで再クロールしない） */
export function stampCompanyIntegrityChecked(id: number): void {
  getDb()
    .prepare(
      "UPDATE companies SET integrity_checked_at = datetime('now','localtime') WHERE id = ?"
    )
    .run(id);
}

export interface InventoryStats {
  /** すぐ送れる連絡先の数（抑止・送信済みを除いた実数） */
  readyCount: number;
  /** 裏処理の待ち行列。ここが詰まると readyCount が増えない */
  pendingEnrichment: number;
  failedEnrichment: number;
  totalCompanies: number;
  /** 直近7日の1日あたり送信数 */
  dailyPace: number;
}

/**
 * 在庫の実数（F25）。
 * contacts の総数ではなく「抑止に載っておらず、まだ送っていない」数を数える。
 * 総数を出すと、実際には送れない宛先まで在庫に見えて枯渇に気づけない。
 */
export function getInventoryStats(): InventoryStats {
  const instance = getDb();

  const ready = instance
    .prepare(
      `SELECT COUNT(*) as count FROM contacts c
       WHERE trim(c.email) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM suppressions s
           WHERE s.target_type = 'email' AND s.target = lower(trim(c.email))
         )
         AND NOT EXISTS (
           SELECT 1 FROM suppressions s
           WHERE s.target_type = 'domain'
             AND s.target = lower(trim(substr(c.email, instr(c.email, '@') + 1)))
         )
         AND NOT EXISTS (
           SELECT 1 FROM send_log l
           WHERE lower(trim(l.to_email)) = lower(trim(c.email))
         )`
    )
    .get() as { count: number };

  const enrichment = instance
    .prepare(
      `SELECT
         SUM(CASE WHEN enrichment_status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN enrichment_status = 'failed' THEN 1 ELSE 0 END) as failed,
         COUNT(*) as total
       FROM companies`
    )
    .get() as { pending: number | null; failed: number | null; total: number };

  const sent = instance
    .prepare(
      `SELECT COUNT(*) as count FROM send_log
       WHERE sent_at >= datetime('now','localtime','-7 days')`
    )
    .get() as { count: number };

  return {
    readyCount: ready.count,
    pendingEnrichment: enrichment.pending ?? 0,
    failedEnrichment: enrichment.failed ?? 0,
    totalCompanies: enrichment.total,
    dailyPace: sent.count / 7,
  };
}
