import { relations } from "drizzle-orm/relations";
import { users, prototypes, events } from "./schema";

export const prototypesRelations = relations(prototypes, ({one, many}) => ({
	user_releasedBy: one(users, {
		fields: [prototypes.releasedBy],
		references: [users.id],
		relationName: "prototypes_releasedBy_users_id"
	}),
	user_reviewedBy: one(users, {
		fields: [prototypes.reviewedBy],
		references: [users.id],
		relationName: "prototypes_reviewedBy_users_id"
	}),
	user_userId: one(users, {
		fields: [prototypes.userId],
		references: [users.id],
		relationName: "prototypes_userId_users_id"
	}),
	events: many(events),
}));

export const usersRelations = relations(users, ({many}) => ({
	prototypes_releasedBy: many(prototypes, {
		relationName: "prototypes_releasedBy_users_id"
	}),
	prototypes_reviewedBy: many(prototypes, {
		relationName: "prototypes_reviewedBy_users_id"
	}),
	prototypes_userId: many(prototypes, {
		relationName: "prototypes_userId_users_id"
	}),
	events_actorId: many(events, {
		relationName: "events_actorId_users_id"
	}),
	events_userId: many(events, {
		relationName: "events_userId_users_id"
	}),
}));

export const eventsRelations = relations(events, ({one}) => ({
	user_actorId: one(users, {
		fields: [events.actorId],
		references: [users.id],
		relationName: "events_actorId_users_id"
	}),
	prototype: one(prototypes, {
		fields: [events.prototypeId],
		references: [prototypes.id]
	}),
	user_userId: one(users, {
		fields: [events.userId],
		references: [users.id],
		relationName: "events_userId_users_id"
	}),
}));