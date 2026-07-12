ALTER TABLE `accounts` ADD COLUMN `banned_at` TEXT;
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `deleted_at` TEXT;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `title` TEXT;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `role` TEXT NOT NULL DEFAULT 'member' CHECK (`role` IN ('member', 'admin'));
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `deleted_at` TEXT;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `last_access_at` TEXT;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0);
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `kind` TEXT NOT NULL DEFAULT 'file' CHECK (`kind` IN ('file', 'photo', 'video', 'gif'));
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `original_name` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `duration_ms` INTEGER CHECK (`duration_ms` IS NULL OR `duration_ms` >= 0);
--> statement-breakpoint
UPDATE `files`
SET `kind` = CASE
  WHEN `content_type` = 'image/gif' THEN 'gif'
  WHEN `content_type` LIKE 'image/%' THEN 'photo'
  WHEN `content_type` LIKE 'video/%' THEN 'video'
  ELSE 'file'
END;
--> statement-breakpoint
CREATE TABLE `server_settings` (
  `id` INTEGER PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `name` TEXT NOT NULL,
  `title` TEXT,
  `photo_file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL,
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `chats` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('dm', 'public_channel', 'private_channel')),
  `name` TEXT,
  `slug` TEXT COLLATE NOCASE,
  `topic` TEXT,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `dm_key` TEXT UNIQUE,
  `pts` INTEGER NOT NULL DEFAULT 0 CHECK (`pts` >= 0),
  `min_recoverable_pts` INTEGER NOT NULL DEFAULT 0 CHECK (`min_recoverable_pts` >= 0),
  `last_message_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`last_message_sequence` >= 0),
  `last_change_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`last_change_sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` TEXT,
  CHECK (
    (`kind` = 'dm' AND `dm_key` IS NOT NULL)
    OR (`kind` != 'dm' AND `dm_key` IS NULL)
  ),
  CHECK (
    `kind` = 'dm'
    OR (`name` IS NOT NULL AND length(trim(`name`)) > 0)
  ),
  CHECK (`min_recoverable_pts` <= `pts`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_active_slug_unique_idx`
ON `chats` (`slug`)
WHERE `slug` IS NOT NULL AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `chats_kind_deleted_idx` ON `chats` (`kind`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `chats_creator_idx` ON `chats` (`created_by_user_id`);
--> statement-breakpoint
CREATE INDEX `chats_last_change_sequence_idx` ON `chats` (`last_change_sequence`);
--> statement-breakpoint
CREATE TABLE `chat_members` (
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `role` TEXT NOT NULL DEFAULT 'member' CHECK (`role` IN ('owner', 'admin', 'member')),
  `membership_epoch` TEXT NOT NULL CHECK (length(`membership_epoch`) > 0),
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `joined_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` TEXT,
  PRIMARY KEY (`chat_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `chat_members_active_user_idx` ON `chat_members` (`user_id`, `left_at`, `chat_id`);
--> statement-breakpoint
CREATE INDEX `chat_members_chat_active_idx` ON `chat_members` (`chat_id`, `left_at`, `user_id`);
--> statement-breakpoint
CREATE INDEX `chat_members_sync_sequence_idx` ON `chat_members` (`sync_sequence`);
--> statement-breakpoint
CREATE TABLE `messages` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `sequence` INTEGER NOT NULL CHECK (`sequence` > 0),
  `change_pts` INTEGER NOT NULL CHECK (`change_pts` > 0),
  `sender_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `kind` TEXT NOT NULL DEFAULT 'user' CHECK (`kind` IN ('user', 'automated')),
  `text` TEXT NOT NULL DEFAULT '',
  `quoted_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `thread_root_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `forwarded_from_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `expires_at` TEXT,
  `edited_at` TEXT,
  `deleted_at` TEXT,
  `deleted_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`chat_id`, `sequence`)
);
--> statement-breakpoint
CREATE INDEX `messages_chat_sequence_idx` ON `messages` (`chat_id`, `sequence`);
--> statement-breakpoint
CREATE INDEX `messages_chat_change_pts_idx` ON `messages` (`chat_id`, `change_pts`);
--> statement-breakpoint
CREATE INDEX `messages_sender_idx` ON `messages` (`sender_user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `messages_quoted_idx` ON `messages` (`quoted_message_id`);
--> statement-breakpoint
CREATE INDEX `messages_thread_root_idx` ON `messages` (`thread_root_message_id`, `sequence`);
--> statement-breakpoint
CREATE INDEX `messages_forwarded_from_idx` ON `messages` (`forwarded_from_message_id`);
--> statement-breakpoint
CREATE INDEX `messages_expiry_idx` ON `messages` (`expires_at`) WHERE `expires_at` IS NOT NULL AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `threads` (
  `root_message_id` TEXT PRIMARY KEY NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `reply_count` INTEGER NOT NULL DEFAULT 0 CHECK (`reply_count` >= 0),
  `last_pts` INTEGER NOT NULL DEFAULT 0 CHECK (`last_pts` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `threads_chat_updated_idx` ON `threads` (`chat_id`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `message_attachments` (
  `message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `file_id` TEXT NOT NULL REFERENCES `files`(`id`) ON DELETE CASCADE,
  `position` INTEGER NOT NULL DEFAULT 0 CHECK (`position` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`, `file_id`),
  UNIQUE (`message_id`, `position`)
);
--> statement-breakpoint
CREATE INDEX `message_attachments_file_idx` ON `message_attachments` (`file_id`, `message_id`);
--> statement-breakpoint
CREATE TABLE `custom_emojis` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(`name`)) > 0),
  `file_id` TEXT NOT NULL REFERENCES `files`(`id`) ON DELETE CASCADE,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_emojis_active_name_unique_idx`
ON `custom_emojis` (`name`)
WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `custom_emojis_sync_sequence_idx` ON `custom_emojis` (`sync_sequence`);
--> statement-breakpoint
CREATE TABLE `reactions` (
  `message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `reaction_key` TEXT NOT NULL CHECK (length(`reaction_key`) > 0),
  `emoji` TEXT,
  `custom_emoji_id` TEXT REFERENCES `custom_emojis`(`id`) ON DELETE CASCADE,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`, `user_id`, `reaction_key`),
  CHECK (
    (`emoji` IS NOT NULL
      AND length(`emoji`) > 0
      AND `custom_emoji_id` IS NULL
      AND `reaction_key` = 'unicode:' || `emoji`)
    OR (`emoji` IS NULL
      AND `custom_emoji_id` IS NOT NULL
      AND `reaction_key` = 'custom:' || `custom_emoji_id`)
  )
);
--> statement-breakpoint
CREATE INDEX `reactions_message_key_idx` ON `reactions` (`message_id`, `reaction_key`);
--> statement-breakpoint
CREATE INDEX `reactions_user_idx` ON `reactions` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `user_chat_preferences` (
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `starred` INTEGER NOT NULL DEFAULT 0 CHECK (`starred` IN (0, 1)),
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `chat_id`)
);
--> statement-breakpoint
CREATE INDEX `user_chat_preferences_order_idx`
ON `user_chat_preferences` (`user_id`, `starred`, `sort_order`, `chat_id`);
--> statement-breakpoint
CREATE INDEX `user_chat_preferences_sync_sequence_idx`
ON `user_chat_preferences` (`sync_sequence`);
--> statement-breakpoint
CREATE TABLE `server_sync_state` (
  `id` INTEGER PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `generation` TEXT NOT NULL CHECK (length(`generation`) > 0),
  `sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `chat_updates` (
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `pts` INTEGER NOT NULL CHECK (`pts` > 0),
  `pts_count` INTEGER NOT NULL DEFAULT 1 CHECK (`pts_count` > 0),
  `kind` TEXT NOT NULL,
  `entity_id` TEXT,
  `payload_json` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`chat_id`, `pts`)
);
--> statement-breakpoint
CREATE INDEX `chat_updates_created_idx` ON `chat_updates` (`created_at`);
--> statement-breakpoint
CREATE TABLE `client_mutations` (
  `actor_user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `scope` TEXT NOT NULL,
  `client_mutation_id` TEXT NOT NULL,
  `result_json` TEXT NOT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`actor_user_id`, `scope`, `client_mutation_id`)
);
--> statement-breakpoint
CREATE INDEX `client_mutations_created_idx` ON `client_mutations` (`created_at`);
--> statement-breakpoint
CREATE TABLE `sync_events` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `sequence` INTEGER NOT NULL CHECK (`sequence` > 0),
  `kind` TEXT NOT NULL,
  `chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE SET NULL,
  `chat_pts` INTEGER CHECK (`chat_pts` IS NULL OR `chat_pts` >= 0),
  `entity_id` TEXT,
  `actor_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `target_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `sync_events_sequence_idx` ON `sync_events` (`sequence`, `id`);
--> statement-breakpoint
CREATE INDEX `sync_events_chat_idx` ON `sync_events` (`chat_id`, `chat_pts`, `id`);
--> statement-breakpoint
CREATE INDEX `sync_events_target_idx` ON `sync_events` (`target_user_id`, `sequence`, `id`);
--> statement-breakpoint
CREATE INDEX `sync_events_entity_idx` ON `sync_events` (`entity_id`, `sequence`);
--> statement-breakpoint
CREATE INDEX `users_sync_sequence_idx` ON `users` (`sync_sequence`);
--> statement-breakpoint
CREATE INDEX `users_last_access_idx` ON `users` (`last_access_at`);
--> statement-breakpoint
CREATE INDEX `accounts_status_idx` ON `accounts` (`active`, `banned_at`, `deleted_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `server_settings` (`id`, `name`) VALUES (1, 'Rigged');
--> statement-breakpoint
UPDATE `users`
SET `role` = 'admin'
WHERE `id` = (
  SELECT `u`.`id`
  FROM `users` AS `u`
  INNER JOIN `accounts` AS `a` ON `a`.`id` = `u`.`account_id`
  WHERE `a`.`active` = 1
    AND `a`.`banned_at` IS NULL
    AND `a`.`deleted_at` IS NULL
    AND `u`.`deleted_at` IS NULL
  ORDER BY `u`.`created_at`, `u`.`id`
  LIMIT 1
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `messages_fts` USING fts5(
  `text`,
  content = 'messages',
  content_rowid = 'rowid',
  tokenize = 'trigram'
);
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ai`
AFTER INSERT ON `messages`
WHEN `new`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `messages_fts` (`rowid`, `text`)
  VALUES (`new`.`rowid`, COALESCE(`new`.`text`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ad`
AFTER DELETE ON `messages`
WHEN `old`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `messages_fts` (`messages_fts`, `rowid`, `text`)
  VALUES ('delete', `old`.`rowid`, COALESCE(`old`.`text`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_au_delete`
AFTER UPDATE ON `messages`
WHEN `old`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `messages_fts` (`messages_fts`, `rowid`, `text`)
  VALUES ('delete', `old`.`rowid`, COALESCE(`old`.`text`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_au_insert`
AFTER UPDATE ON `messages`
WHEN `new`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `messages_fts` (`rowid`, `text`)
  VALUES (`new`.`rowid`, COALESCE(`new`.`text`, ''));
END;
--> statement-breakpoint
INSERT INTO `messages_fts` (`rowid`, `text`)
SELECT `rowid`, COALESCE(`text`, '')
FROM `messages`
WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE VIRTUAL TABLE `chats_fts` USING fts5(
  `name`,
  `slug`,
  `topic`,
  content = 'chats',
  content_rowid = 'rowid',
  tokenize = 'trigram'
);
--> statement-breakpoint
CREATE TRIGGER `chats_fts_ai`
AFTER INSERT ON `chats`
WHEN `new`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `chats_fts` (`rowid`, `name`, `slug`, `topic`)
  VALUES (
    `new`.`rowid`,
    COALESCE(`new`.`name`, ''),
    COALESCE(`new`.`slug`, ''),
    COALESCE(`new`.`topic`, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `chats_fts_ad`
AFTER DELETE ON `chats`
WHEN `old`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `chats_fts` (`chats_fts`, `rowid`, `name`, `slug`, `topic`)
  VALUES (
    'delete',
    `old`.`rowid`,
    COALESCE(`old`.`name`, ''),
    COALESCE(`old`.`slug`, ''),
    COALESCE(`old`.`topic`, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `chats_fts_au_delete`
AFTER UPDATE ON `chats`
WHEN `old`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `chats_fts` (`chats_fts`, `rowid`, `name`, `slug`, `topic`)
  VALUES (
    'delete',
    `old`.`rowid`,
    COALESCE(`old`.`name`, ''),
    COALESCE(`old`.`slug`, ''),
    COALESCE(`old`.`topic`, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `chats_fts_au_insert`
AFTER UPDATE ON `chats`
WHEN `new`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `chats_fts` (`rowid`, `name`, `slug`, `topic`)
  VALUES (
    `new`.`rowid`,
    COALESCE(`new`.`name`, ''),
    COALESCE(`new`.`slug`, ''),
    COALESCE(`new`.`topic`, '')
  );
END;
--> statement-breakpoint
INSERT INTO `chats_fts` (`rowid`, `name`, `slug`, `topic`)
SELECT
  `rowid`,
  COALESCE(`name`, ''),
  COALESCE(`slug`, ''),
  COALESCE(`topic`, '')
FROM `chats`
WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE VIRTUAL TABLE `users_fts` USING fts5(
  `first_name`,
  `last_name`,
  `username`,
  `title`,
  content = 'users',
  content_rowid = 'rowid',
  tokenize = 'trigram'
);
--> statement-breakpoint
CREATE TRIGGER `users_fts_ai`
AFTER INSERT ON `users`
WHEN `new`.`deleted_at` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `accounts`
    WHERE `id` = `new`.`account_id`
      AND `active` = 1
      AND `banned_at` IS NULL
      AND `deleted_at` IS NULL
  )
BEGIN
  INSERT INTO `users_fts` (`rowid`, `first_name`, `last_name`, `username`, `title`)
  VALUES (
    `new`.`rowid`,
    COALESCE(`new`.`first_name`, ''),
    COALESCE(`new`.`last_name`, ''),
    COALESCE(`new`.`username`, ''),
    COALESCE(`new`.`title`, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `users_fts_ad`
AFTER DELETE ON `users`
WHEN `old`.`deleted_at` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `accounts`
    WHERE `id` = `old`.`account_id`
      AND `active` = 1
      AND `banned_at` IS NULL
      AND `deleted_at` IS NULL
  )
BEGIN
  INSERT INTO `users_fts` (`users_fts`, `rowid`, `first_name`, `last_name`, `username`, `title`)
  VALUES (
    'delete',
    `old`.`rowid`,
    COALESCE(`old`.`first_name`, ''),
    COALESCE(`old`.`last_name`, ''),
    COALESCE(`old`.`username`, ''),
    COALESCE(`old`.`title`, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `users_fts_au_delete`
AFTER UPDATE ON `users`
WHEN `old`.`deleted_at` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `accounts`
    WHERE `id` = `old`.`account_id`
      AND `active` = 1
      AND `banned_at` IS NULL
      AND `deleted_at` IS NULL
  )
BEGIN
  INSERT INTO `users_fts` (`users_fts`, `rowid`, `first_name`, `last_name`, `username`, `title`)
  VALUES (
    'delete',
    `old`.`rowid`,
    COALESCE(`old`.`first_name`, ''),
    COALESCE(`old`.`last_name`, ''),
    COALESCE(`old`.`username`, ''),
    COALESCE(`old`.`title`, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `users_fts_au_insert`
AFTER UPDATE ON `users`
WHEN `new`.`deleted_at` IS NULL
  AND EXISTS (
    SELECT 1
    FROM `accounts`
    WHERE `id` = `new`.`account_id`
      AND `active` = 1
      AND `banned_at` IS NULL
      AND `deleted_at` IS NULL
  )
BEGIN
  INSERT INTO `users_fts` (`rowid`, `first_name`, `last_name`, `username`, `title`)
  VALUES (
    `new`.`rowid`,
    COALESCE(`new`.`first_name`, ''),
    COALESCE(`new`.`last_name`, ''),
    COALESCE(`new`.`username`, ''),
    COALESCE(`new`.`title`, '')
  );
END;
--> statement-breakpoint
CREATE TRIGGER `accounts_users_fts_bu`
BEFORE UPDATE OF `active`, `banned_at`, `deleted_at` ON `accounts`
WHEN `old`.`active` = 1
  AND `old`.`banned_at` IS NULL
  AND `old`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `users_fts` (`users_fts`, `rowid`, `first_name`, `last_name`, `username`, `title`)
  SELECT
    'delete',
    `u`.`rowid`,
    COALESCE(`u`.`first_name`, ''),
    COALESCE(`u`.`last_name`, ''),
    COALESCE(`u`.`username`, ''),
    COALESCE(`u`.`title`, '')
  FROM `users` AS `u`
  WHERE `u`.`account_id` = `old`.`id`
    AND `u`.`deleted_at` IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `accounts_users_fts_au`
AFTER UPDATE OF `active`, `banned_at`, `deleted_at` ON `accounts`
WHEN `new`.`active` = 1
  AND `new`.`banned_at` IS NULL
  AND `new`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `users_fts` (`rowid`, `first_name`, `last_name`, `username`, `title`)
  SELECT
    `u`.`rowid`,
    COALESCE(`u`.`first_name`, ''),
    COALESCE(`u`.`last_name`, ''),
    COALESCE(`u`.`username`, ''),
    COALESCE(`u`.`title`, '')
  FROM `users` AS `u`
  WHERE `u`.`account_id` = `new`.`id`
    AND `u`.`deleted_at` IS NULL;
END;
--> statement-breakpoint
CREATE TRIGGER `accounts_users_fts_bd`
BEFORE DELETE ON `accounts`
WHEN `old`.`active` = 1
  AND `old`.`banned_at` IS NULL
  AND `old`.`deleted_at` IS NULL
BEGIN
  INSERT INTO `users_fts` (`users_fts`, `rowid`, `first_name`, `last_name`, `username`, `title`)
  SELECT
    'delete',
    `u`.`rowid`,
    COALESCE(`u`.`first_name`, ''),
    COALESCE(`u`.`last_name`, ''),
    COALESCE(`u`.`username`, ''),
    COALESCE(`u`.`title`, '')
  FROM `users` AS `u`
  WHERE `u`.`account_id` = `old`.`id`
    AND `u`.`deleted_at` IS NULL;
END;
--> statement-breakpoint
INSERT INTO `users_fts` (`rowid`, `first_name`, `last_name`, `username`, `title`)
SELECT
  `u`.`rowid`,
  COALESCE(`u`.`first_name`, ''),
  COALESCE(`u`.`last_name`, ''),
  COALESCE(`u`.`username`, ''),
  COALESCE(`u`.`title`, '')
FROM `users` AS `u`
INNER JOIN `accounts` AS `a` ON `a`.`id` = `u`.`account_id`
WHERE `u`.`deleted_at` IS NULL
  AND `a`.`active` = 1
  AND `a`.`banned_at` IS NULL
  AND `a`.`deleted_at` IS NULL;
