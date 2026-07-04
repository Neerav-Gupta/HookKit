/**
 * Inspector storage: single-file synchronous SQLite (better-sqlite3).
 * Schema follows the build brief §8 verbatim. Bodies are stored as BLOBs —
 * the exact received bytes, never re-serialized.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

export interface EndpointRow {
	id: string;
	slug: string;
	name: string;
	created_at: number;
}

export interface RequestRow {
	id: string;
	endpoint_id: string;
	method: string;
	headers_json: string;
	body_blob: Buffer;
	query_json: string;
	source_ip: string;
	received_at: number;
	signature_status: string;
	provider_guess: string;
}

export interface ReplayRow {
	id: string;
	request_id: string;
	target_url: string;
	status: number;
	response_ms: number;
	created_at: number;
}

export function defaultDbPath(): string {
	return join(homedir(), ".hookkit", "inspector.sqlite");
}

export class InspectorDb {
	readonly db: Database.Database;

	constructor(path: string = defaultDbPath()) {
		if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
		this.db = new Database(path);
		this.db.pragma("journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS endpoints(
				id TEXT PRIMARY KEY, slug TEXT UNIQUE, name TEXT, created_at INTEGER);
			CREATE TABLE IF NOT EXISTS requests(
				id TEXT PRIMARY KEY, endpoint_id TEXT, method TEXT, headers_json TEXT,
				body_blob BLOB, query_json TEXT, source_ip TEXT, received_at INTEGER,
				signature_status TEXT, provider_guess TEXT);
			CREATE TABLE IF NOT EXISTS replays(
				id TEXT PRIMARY KEY, request_id TEXT, target_url TEXT, status INTEGER,
				response_ms INTEGER, created_at INTEGER);
			CREATE INDEX IF NOT EXISTS idx_requests_endpoint ON requests(endpoint_id, received_at DESC);
		`);
	}

	createEndpoint(name: string): EndpointRow {
		const row: EndpointRow = {
			id: randomUUID(),
			slug: randomBytes(6).toString("hex"),
			name,
			created_at: Date.now(),
		};
		this.db
			.prepare(
				"INSERT INTO endpoints(id, slug, name, created_at) VALUES (?, ?, ?, ?)",
			)
			.run(row.id, row.slug, row.name, row.created_at);
		return row;
	}

	listEndpoints(): EndpointRow[] {
		return this.db
			.prepare("SELECT * FROM endpoints ORDER BY created_at DESC")
			.all() as EndpointRow[];
	}

	endpointBySlug(slug: string): EndpointRow | undefined {
		return this.db
			.prepare("SELECT * FROM endpoints WHERE slug = ?")
			.get(slug) as EndpointRow | undefined;
	}

	insertRequest(row: Omit<RequestRow, "id">): RequestRow {
		const full: RequestRow = { id: randomUUID(), ...row };
		this.db
			.prepare(
				`INSERT INTO requests(id, endpoint_id, method, headers_json, body_blob,
					query_json, source_ip, received_at, signature_status, provider_guess)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.run(
				full.id,
				full.endpoint_id,
				full.method,
				full.headers_json,
				full.body_blob,
				full.query_json,
				full.source_ip,
				full.received_at,
				full.signature_status,
				full.provider_guess,
			);
		return full;
	}

	listRequests(endpointId: string, limit = 200): RequestRow[] {
		return this.db
			.prepare(
				"SELECT * FROM requests WHERE endpoint_id = ? ORDER BY received_at DESC LIMIT ?",
			)
			.all(endpointId, limit) as RequestRow[];
	}

	requestById(id: string): RequestRow | undefined {
		return this.db.prepare("SELECT * FROM requests WHERE id = ?").get(id) as
			| RequestRow
			| undefined;
	}

	insertReplay(row: Omit<ReplayRow, "id" | "created_at">): ReplayRow {
		const full: ReplayRow = {
			id: randomUUID(),
			created_at: Date.now(),
			...row,
		};
		this.db
			.prepare(
				`INSERT INTO replays(id, request_id, target_url, status, response_ms, created_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
			)
			.run(
				full.id,
				full.request_id,
				full.target_url,
				full.status,
				full.response_ms,
				full.created_at,
			);
		return full;
	}

	listReplays(requestId: string): ReplayRow[] {
		return this.db
			.prepare(
				"SELECT * FROM replays WHERE request_id = ? ORDER BY created_at DESC",
			)
			.all(requestId) as ReplayRow[];
	}

	close(): void {
		this.db.close();
	}
}
