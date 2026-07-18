ALTER TABLE `users` ADD COLUMN `agent_role` TEXT CHECK (`agent_role` IS NULL OR (`agent_role` = 'default' AND `kind` = 'agent' AND `account_id` IS NULL AND `system_role` IS NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX `users_agent_role_unique_idx`
ON `users` (`agent_role`)
WHERE `agent_role` IS NOT NULL AND `deleted_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `default_agent_user_id` TEXT REFERENCES `users`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `is_pinned_happy` INTEGER NOT NULL DEFAULT 0 CHECK (`is_pinned_happy` IN (0, 1) AND (`is_pinned_happy` = 0 OR (`kind` = 'dm' AND `dm_type` = 'direct' AND `deleted_at` IS NULL)));
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_one_pinned_happy_per_owner_idx`
ON `chats` (`owner_user_id`)
WHERE `is_pinned_happy` = 1 AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TRIGGER `chats_pinned_happy_immutable`
BEFORE UPDATE OF `is_pinned_happy`, `deleted_at` ON `chats`
WHEN OLD.`is_pinned_happy` = 1 AND (NEW.`is_pinned_happy` != 1 OR NEW.`deleted_at` IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'pinned Happy conversation is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_pinned_happy_no_delete`
BEFORE DELETE ON `chats`
WHEN OLD.`is_pinned_happy` = 1
BEGIN
    SELECT RAISE(ABORT, 'pinned Happy conversation cannot be deleted');
END;
