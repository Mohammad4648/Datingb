import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { profilesTable } from "./social";

export const socialPostsTable = pgTable(
  "social_posts",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    caption: text("caption").notNull().default(""),
    durationSeconds: integer("duration_seconds").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("social_posts_profile_created_idx").on(
      table.profileId,
      table.createdAt,
    ),
    uniqueIndex("social_posts_object_path_idx").on(table.objectPath),
  ],
);

export const insertSocialPostSchema = createInsertSchema(socialPostsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPostRecord = typeof socialPostsTable.$inferSelect;
