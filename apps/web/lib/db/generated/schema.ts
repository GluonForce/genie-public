import { pgTable, unique, check, uuid, text, inet, timestamp, index, foreignKey, bigint, jsonb, integer, boolean, numeric, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const actorRole = pgEnum("actor_role", ['user', 'admin', 'system'])
export const prototypeStatus = pgEnum("prototype_status", ['recording', 'requirements_ready', 'pending_review', 'user_declined', 'approved', 'building', 'build_failed', 'awaiting_qa', 'released', 'expired', 'declined', 'offline'])


export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clerkUserId: text("clerk_user_id"),
	email: text().notNull(),
	emailNormalized: text("email_normalized").notNull(),
	role: text().default('user').notNull(),
	signupIp: inet("signup_ip"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	unique("users_clerk_user_id_key").on(table.clerkUserId),
	unique("users_email_normalized_key").on(table.emailNormalized),
	check("users_role_check", sql`role = ANY (ARRAY['user'::text, 'admin'::text])`),
]);

export const events = pgTable("events", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "events_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	actorId: uuid("actor_id"),
	actorRole: actorRole("actor_role").notNull(),
	userId: uuid("user_id"),
	prototypeId: uuid("prototype_id"),
	action: text().notNull(),
	fromStatus: prototypeStatus("from_status"),
	toStatus: prototypeStatus("to_status"),
	ip: inet(),
	reason: text(),
	details: jsonb(),
}, (table) => [
	index("events_ip_idx").using("btree", table.ip.asc().nullsLast().op("inet_ops")).where(sql`(ip IS NOT NULL)`),
	index("events_prototype_idx").using("btree", table.prototypeId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("uuid_ops")),
	index("events_user_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.actorId],
			foreignColumns: [users.id],
			name: "events_actor_id_fkey"
		}),
	foreignKey({
			columns: [table.prototypeId],
			foreignColumns: [prototypes.id],
			name: "events_prototype_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "events_user_id_fkey"
		}),
]);

export const prototypes = pgTable("prototypes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	slug: text(),
	title: text(),
	status: prototypeStatus().default('recording').notNull(),
	statusChangedAt: timestamp("status_changed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	audioChunkCount: integer("audio_chunk_count").default(0).notNull(),
	recordingDurationMs: integer("recording_duration_ms"),
	transcript: text(),
	recordingLockedAt: timestamp("recording_locked_at", { withTimezone: true, mode: 'string' }),
	requirements: jsonb(),
	revisionCount: integer("revision_count").default(0).notNull(),
	submittedAt: timestamp("submitted_at", { withTimezone: true, mode: 'string' }),
	ipFlagged: boolean("ip_flagged").default(false).notNull(),
	userDeclineReason: text("user_decline_reason"),
	reviewedBy: uuid("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	decisionCategory: text("decision_category"),
	decisionReason: text("decision_reason"),
	buildAttempts: integer("build_attempts").default(0).notNull(),
	buildNote: text("build_note"),
	buildClaimedBy: text("build_claimed_by"),
	buildHeartbeatAt: timestamp("build_heartbeat_at", { withTimezone: true, mode: 'string' }),
	buildCostUsd: numeric("build_cost_usd", { precision: 10, scale:  4 }).default('0').notNull(),
	sourcePath: text("source_path"),
	sitePath: text("site_path"),
	siteUrl: text("site_url"),
	releasedBy: uuid("released_by"),
	releasedAt: timestamp("released_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	transcriptionCostUsd: numeric("transcription_cost_usd", { precision: 10, scale:  4 }).default('0').notNull(),
	requirementsCostUsd: numeric("requirements_cost_usd", { precision: 10, scale:  4 }).default('0').notNull(),
}, (table) => [
	index("prototypes_status_idx").using("btree", table.status.asc().nullsLast().op("timestamptz_ops"), table.statusChangedAt.asc().nullsLast().op("enum_ops")),
	foreignKey({
			columns: [table.releasedBy],
			foreignColumns: [users.id],
			name: "prototypes_released_by_fkey"
		}),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "prototypes_reviewed_by_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "prototypes_user_id_fkey"
		}),
	unique("prototypes_user_id_key").on(table.userId),
	unique("prototypes_slug_key").on(table.slug),
	check("prototypes_audio_chunk_count_check", sql`audio_chunk_count >= 0`),
	check("prototypes_build_attempts_check", sql`build_attempts >= 0`),
	check("prototypes_decision_category_check", sql`decision_category = ANY (ARRAY['unclear'::text, 'out_of_scope'::text, 'abusive'::text, 'duplicate'::text])`),
	check("prototypes_recording_duration_ms_check", sql`recording_duration_ms >= 0`),
	check("prototypes_revision_count_check", sql`(revision_count >= 0) AND (revision_count <= 2)`),
]);
