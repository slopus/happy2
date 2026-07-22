CREATE TABLE `projects` (
    `id` TEXT PRIMARY KEY NOT NULL,
    `name` TEXT NOT NULL CHECK (length(trim(`name`)) > 0),
    `description` TEXT,
    `is_default` INTEGER NOT NULL DEFAULT 0 CHECK (`is_default` IN (0, 1)),
    `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
    `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_one_default_idx`
ON `projects` (`is_default`)
WHERE `is_default` = 1;
--> statement-breakpoint
CREATE INDEX `projects_sync_sequence_idx` ON `projects` (`sync_sequence`);
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `project_id` TEXT REFERENCES `projects`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX `chats_project_id_idx` ON `chats` (`project_id`);
--> statement-breakpoint
INSERT INTO `projects` (`id`, `name`, `is_default`)
SELECT 'happy2_temporary_default_project', 'General', 1
WHERE EXISTS (SELECT 1 FROM `chats` WHERE `kind` != 'dm');
--> statement-breakpoint
UPDATE `chats`
SET `project_id` = 'happy2_temporary_default_project'
WHERE `kind` != 'dm';
--> statement-breakpoint
CREATE TRIGGER `chats_channel_project_required_insert`
BEFORE INSERT ON `chats`
WHEN NEW.`kind` != 'dm' AND NEW.`project_id` IS NULL
BEGIN
    SELECT RAISE(ABORT, 'channels require a project');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_channel_project_required_update`
BEFORE UPDATE OF `kind`, `project_id` ON `chats`
WHEN NEW.`kind` != 'dm' AND NEW.`project_id` IS NULL
BEGIN
    SELECT RAISE(ABORT, 'channels require a project');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_dm_project_forbidden_insert`
BEFORE INSERT ON `chats`
WHEN NEW.`kind` = 'dm' AND NEW.`project_id` IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'direct messages cannot belong to a project');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_dm_project_forbidden_update`
BEFORE UPDATE OF `kind`, `project_id` ON `chats`
WHEN NEW.`kind` = 'dm' AND NEW.`project_id` IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'direct messages cannot belong to a project');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_child_project_match_insert`
BEFORE INSERT ON `chats`
WHEN NEW.`parent_chat_id` IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM `chats` AS `parent`
        WHERE `parent`.`id` = NEW.`parent_chat_id`
          AND `parent`.`project_id` IS NEW.`project_id`
    )
BEGIN
    SELECT RAISE(ABORT, 'child channels must share their parent project');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_child_project_match_update`
BEFORE UPDATE OF `parent_chat_id`, `project_id` ON `chats`
WHEN OLD.`project_id` != 'happy2_temporary_default_project'
    AND NEW.`parent_chat_id` IS NOT NULL
    AND NOT EXISTS (
        SELECT 1
        FROM `chats` AS `parent`
        WHERE `parent`.`id` = NEW.`parent_chat_id`
          AND `parent`.`project_id` IS NEW.`project_id`
    )
BEGIN
    SELECT RAISE(ABORT, 'child channels must share their parent project');
END;
--> statement-breakpoint
CREATE TRIGGER `chats_parent_project_match_update`
BEFORE UPDATE OF `project_id` ON `chats`
WHEN OLD.`project_id` != 'happy2_temporary_default_project'
    AND EXISTS (
        SELECT 1
        FROM `chats` AS `child`
        WHERE `child`.`parent_chat_id` = OLD.`id`
          AND `child`.`project_id` IS NOT NEW.`project_id`
    )
BEGIN
    SELECT RAISE(ABORT, 'parent channels must share their child projects');
END;
