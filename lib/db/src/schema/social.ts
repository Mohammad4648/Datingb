import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const profilesTable = pgTable(
  "social_profiles",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    age: integer("age").notNull(),
    city: text("city").notNull(),
    bio: text("bio").notNull().default(""),
    avatarUrl: text("avatar_url"),
    languages: text("languages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    interests: text("interests")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isOnline: boolean("is_online").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("social_profiles_clerk_user_idx").on(table.clerkUserId)],
);

export const conversationsTable = pgTable("social_conversations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const conversationMembersTable = pgTable(
  "social_conversation_members",
  {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("social_conversation_member_unique").on(
      table.conversationId,
      table.profileId,
    ),
  ],
);

export const roomsTable = pgTable("social_rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  city: text("city").notNull(),
  topic: text("topic").notNull(),
  createdBy: integer("created_by").references(() => profilesTable.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const roomMembersTable = pgTable(
  "social_room_members",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => roomsTable.id, { onDelete: "cascade" }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("social_room_member_unique").on(table.roomId, table.profileId),
  ],
);

export const messagesTable = pgTable("social_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(
    () => conversationsTable.id,
    { onDelete: "cascade" },
  ),
  roomId: integer("room_id").references(() => roomsTable.id, {
    onDelete: "cascade",
  }),
  senderId: integer("sender_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const blockedProfilesTable = pgTable(
  "social_blocked_profiles",
  {
    id: serial("id").primaryKey(),
    blockerId: integer("blocker_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    blockedId: integer("blocked_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("social_blocked_pair_unique").on(table.blockerId, table.blockedId),
  ],
);

export const safetyReportsTable = pgTable("social_safety_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  reportedId: integer("reported_id")
    .notNull()
    .references(() => profilesTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
