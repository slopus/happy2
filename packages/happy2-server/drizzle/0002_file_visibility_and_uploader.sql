ALTER TABLE `files` ADD COLUMN `uploaded_by_user_id` TEXT;
--> statement-breakpoint
UPDATE `files` SET `uploaded_by_user_id` = `user_id` WHERE `uploaded_by_user_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `is_public` INTEGER NOT NULL DEFAULT 0;
