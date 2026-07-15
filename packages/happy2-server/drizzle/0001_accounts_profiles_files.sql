ALTER TABLE `users` RENAME TO `accounts`;
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `active` INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `oidc_identities` RENAME COLUMN `user_id` TO `account_id`;
--> statement-breakpoint
ALTER TABLE `auth_sessions` RENAME COLUMN `user_id` TO `account_id`;
--> statement-breakpoint
ALTER TABLE `auth_magic_links` RENAME COLUMN `user_id` TO `account_id`;
--> statement-breakpoint
CREATE TABLE `users` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `account_id` TEXT UNIQUE REFERENCES `accounts`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL DEFAULT 'human' CHECK (`kind` IN ('human', 'agent')),
  `agent_image_id` TEXT REFERENCES `agent_images`(`id`) ON DELETE RESTRICT,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `first_name` TEXT NOT NULL,
  `last_name` TEXT,
  `username` TEXT NOT NULL UNIQUE,
  `email` TEXT,
  `phone` TEXT,
  `photo_file_id` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (`kind` = 'human' AND `account_id` IS NOT NULL AND `agent_image_id` IS NULL)
    OR (`kind` = 'agent' AND `account_id` IS NULL AND `agent_image_id` IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE TABLE `files` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `storage_name` TEXT NOT NULL UNIQUE,
  `content_type` TEXT NOT NULL,
  `size` INTEGER NOT NULL,
  `width` INTEGER NOT NULL,
  `height` INTEGER NOT NULL,
  `thumbhash` TEXT NOT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `files_user_idx` ON `files` (`user_id`);
