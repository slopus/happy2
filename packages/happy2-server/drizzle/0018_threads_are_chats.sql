ALTER TABLE `chats` ADD COLUMN `parent_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_parent_message_unique_idx` ON `chats` (`parent_message_id`) WHERE `parent_message_id` IS NOT NULL AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `chats_parent_message_idx` ON `chats` (`parent_message_id`, `deleted_at`);
--> statement-breakpoint
ALTER TABLE `user_chat_preferences` ADD COLUMN `followed` INTEGER NOT NULL DEFAULT 0 CHECK (`followed` IN (0, 1));
--> statement-breakpoint
CREATE INDEX `user_chat_preferences_followed_idx` ON `user_chat_preferences` (`user_id`, `followed`, `updated_at` DESC);
--> statement-breakpoint
DROP TABLE `thread_user_states`;
--> statement-breakpoint
DROP TABLE `thread_participants`;
--> statement-breakpoint
ALTER TABLE `notifications` DROP COLUMN `thread_root_message_id`;
--> statement-breakpoint
DROP TABLE `threads`;
--> statement-breakpoint
ALTER TABLE `scheduled_messages` DROP COLUMN `thread_root_message_id`;
--> statement-breakpoint
DROP INDEX `messages_thread_root_idx`;
--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `thread_root_message_id`;
