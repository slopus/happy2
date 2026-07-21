UPDATE `chats`
SET `deleted_at` = COALESCE(`deleted_at`, CURRENT_TIMESTAMP),
    `delete_reason` = COALESCE(`delete_reason`, 'Threads were replaced by child channels')
WHERE `parent_message_id` IS NOT NULL;
--> statement-breakpoint
DELETE FROM `notifications` WHERE `kind` = 'thread_reply';
--> statement-breakpoint
DROP INDEX `chats_parent_message_unique_idx`;
--> statement-breakpoint
DROP INDEX `chats_parent_message_idx`;
--> statement-breakpoint
DROP INDEX `user_chat_preferences_followed_idx`;
--> statement-breakpoint
ALTER TABLE `chats` DROP COLUMN `parent_message_id`;
--> statement-breakpoint
ALTER TABLE `user_chat_preferences` DROP COLUMN `notify_thread_replies`;
--> statement-breakpoint
ALTER TABLE `user_chat_preferences` DROP COLUMN `followed`;
--> statement-breakpoint
ALTER TABLE `user_notification_preferences` DROP COLUMN `thread_replies`;
