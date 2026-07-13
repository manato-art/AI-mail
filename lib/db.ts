import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type {
  Persona,
  PersonaInput,
  Prospect,
  Service,
  ServiceInput,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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

function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, "sales-mail.db");
  const instance = new Database(dbPath);
  instance.pragma("journal_mode = WAL");

  createTables(instance);
  seedPersonas(instance);
  seedServices(instance);

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
      form_url, is_form_only, compatibility_score
    ) VALUES (
      @input_url, @domain, @company_name, @analysis_json, @service_id, @persona_id,
      @subject, @body, @generated_subject, @generated_body, @emails_found_json,
      @form_url, @is_form_only, @compatibility_score
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

export function findProspectByDomain(domain: string): Prospect | undefined {
  return getDb()
    .prepare("SELECT * FROM prospects WHERE domain = ? ORDER BY id DESC LIMIT 1")
    .get(domain) as Prospect | undefined;
}
