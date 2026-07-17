ALTER TABLE `agent_images` ADD COLUMN `system_only` INTEGER NOT NULL DEFAULT 0 CHECK (`system_only` IN (0, 1));
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_images_one_system_only_idx`
ON `agent_images` (`system_only`)
WHERE `system_only` = 1;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `system_role` TEXT CHECK (`system_role` IS NULL OR (`system_role` = 'service' AND `kind` = 'agent' AND `account_id` IS NULL));
--> statement-breakpoint
CREATE UNIQUE INDEX `users_system_role_unique_idx`
ON `users` (`system_role`)
WHERE `system_role` IS NOT NULL AND `deleted_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `auto_join` INTEGER NOT NULL DEFAULT 0 CHECK (`auto_join` IN (0, 1));
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `is_main` INTEGER NOT NULL DEFAULT 0 CHECK (`is_main` IN (0, 1) AND (`is_main` = 0 OR (`kind` = 'public_channel' AND `auto_join` = 1 AND `is_listed` = 1 AND `deleted_at` IS NULL AND `archived_at` IS NULL)));
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_one_active_main_idx`
ON `chats` (`is_main`)
WHERE `is_main` = 1 AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TRIGGER `chats_main_identity_immutable`
BEFORE UPDATE OF `is_main` ON `chats`
WHEN OLD.`is_main` = 1 AND NEW.`is_main` = 0
BEGIN
    SELECT RAISE(ABORT, 'main channel identity is immutable');
END;
