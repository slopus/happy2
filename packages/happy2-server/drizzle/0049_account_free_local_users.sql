PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
CREATE TABLE `users_account_free_local` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `account_id` TEXT UNIQUE REFERENCES `accounts`(`id`) ON DELETE CASCADE,
  `active` INTEGER NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `kind` TEXT NOT NULL DEFAULT 'human' CHECK (`kind` IN ('human', 'agent')),
  `agent_image_id` TEXT REFERENCES `agent_images`(`id`) ON DELETE RESTRICT,
  `created_by_user_id` TEXT REFERENCES `users_account_free_local`(`id`) ON DELETE SET NULL,
  `first_name` TEXT NOT NULL,
  `last_name` TEXT,
  `username` TEXT NOT NULL UNIQUE,
  `email` TEXT,
  `phone` TEXT,
  `photo_file_id` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `title` TEXT,
  `role` TEXT NOT NULL DEFAULT 'member' CHECK (`role` IN ('member', 'admin')),
  `deleted_at` TEXT,
  `last_access_at` TEXT,
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `agent_effort` TEXT,
  `agent_role` TEXT CHECK (`agent_role` IS NULL OR (`agent_role` = 'default' AND `kind` = 'agent' AND `account_id` IS NULL)),
  `last_seen_at` TEXT,
  CHECK (
    (`kind` = 'human' AND `agent_image_id` IS NULL)
    OR (
      `kind` = 'agent'
      AND `account_id` IS NULL
      AND `agent_image_id` IS NOT NULL
    )
  )
);
--> statement-breakpoint
INSERT INTO `users_account_free_local` (
  `rowid`, `id`, `account_id`, `active`, `kind`, `agent_image_id`, `created_by_user_id`,
  `first_name`, `last_name`, `username`, `email`, `phone`, `photo_file_id`,
  `created_at`, `title`, `role`, `deleted_at`, `last_access_at`, `sync_sequence`,
  `agent_effort`, `agent_role`, `last_seen_at`
)
SELECT
  `rowid`, `id`, `account_id`,
  CASE
    WHEN `kind` = 'agent' THEN 1
    WHEN EXISTS (
      SELECT 1 FROM `accounts`
      WHERE `accounts`.`id` = `users`.`account_id`
        AND `accounts`.`active` = 1
        AND `accounts`.`banned_at` IS NULL
        AND `accounts`.`deleted_at` IS NULL
    ) THEN 1
    ELSE 0
  END,
  `kind`, `agent_image_id`, `created_by_user_id`,
  `first_name`, `last_name`, `username`, `email`, `phone`, `photo_file_id`,
  `created_at`, `title`, `role`, `deleted_at`, `last_access_at`, `sync_sequence`,
  `agent_effort`, `agent_role`, `last_seen_at`
FROM `users`;
--> statement-breakpoint
DROP TRIGGER `accounts_users_fts_bu`;
--> statement-breakpoint
DROP TRIGGER `accounts_users_fts_au`;
--> statement-breakpoint
DROP TRIGGER `accounts_users_fts_bd`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `users_account_free_local` RENAME TO `users`;
--> statement-breakpoint
CREATE INDEX `users_sync_sequence_idx` ON `users` (`sync_sequence`);
--> statement-breakpoint
CREATE INDEX `users_last_access_idx` ON `users` (`last_access_at`);
--> statement-breakpoint
CREATE INDEX `users_active_idx` ON `users` (`active`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `users_search_cursor_idx` ON `users` (`created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_agent_role_unique_idx`
ON `users` (`agent_role`)
WHERE `agent_role` IS NOT NULL AND `deleted_at` IS NULL;
--> statement-breakpoint
-- Reassert the 0048 public-channel contract in case legacy owner state was written
-- between migrations. Public managers are administrators, never owners.
UPDATE `chat_members`
SET `role` = 'admin', `updated_at` = CURRENT_TIMESTAMP
WHERE `role` = 'owner'
  AND EXISTS (
    SELECT 1
    FROM `chats`
    WHERE `chats`.`id` = `chat_members`.`chat_id`
      AND `chats`.`kind` = 'public_channel'
  );
--> statement-breakpoint
UPDATE `chats`
SET `owner_user_id` = NULL, `updated_at` = CURRENT_TIMESTAMP
WHERE `kind` = 'public_channel'
  AND `owner_user_id` IS NOT NULL;
--> statement-breakpoint
-- Private channels keep their declared active human member as owner when eligible,
-- then deterministically prefer another active human owner, admin, or member.
-- Public channels were normalized to ownerless administration in 0048; DMs stay unchanged.
CREATE TEMP TABLE `_0049_private_channel_owner_normalization` (
  `chat_id` TEXT PRIMARY KEY NOT NULL,
  `owner_user_id` TEXT
);
--> statement-breakpoint
INSERT INTO `_0049_private_channel_owner_normalization` (`chat_id`, `owner_user_id`)
SELECT
  `channel`.`id`,
  COALESCE(
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM `chat_members` AS `declared_membership`
        INNER JOIN `users` AS `declared_user`
          ON `declared_user`.`id` = `declared_membership`.`user_id`
        WHERE `declared_membership`.`chat_id` = `channel`.`id`
          AND `declared_membership`.`user_id` = `channel`.`owner_user_id`
          AND `declared_membership`.`left_at` IS NULL
          AND `declared_user`.`kind` = 'human'
          AND `declared_user`.`active` = 1
          AND `declared_user`.`deleted_at` IS NULL
      ) THEN `channel`.`owner_user_id`
    END,
    (
      SELECT `candidate_membership`.`user_id`
      FROM `chat_members` AS `candidate_membership`
      INNER JOIN `users` AS `candidate_user`
        ON `candidate_user`.`id` = `candidate_membership`.`user_id`
      WHERE `candidate_membership`.`chat_id` = `channel`.`id`
        AND `candidate_membership`.`left_at` IS NULL
        AND `candidate_user`.`kind` = 'human'
        AND `candidate_user`.`active` = 1
        AND `candidate_user`.`deleted_at` IS NULL
      ORDER BY
        CASE `candidate_membership`.`role`
          WHEN 'owner' THEN 0
          WHEN 'admin' THEN 1
          ELSE 2
        END,
        `candidate_membership`.`joined_at`,
        `candidate_membership`.`user_id`
      LIMIT 1
    )
  )
FROM `chats` AS `channel`
WHERE `channel`.`kind` = 'private_channel';
--> statement-breakpoint
UPDATE `chat_members`
SET `role` = 'member'
WHERE `role` = 'owner'
  AND `chat_id` IN (SELECT `chat_id` FROM `_0049_private_channel_owner_normalization`)
  AND (
    `left_at` IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM `users`
      WHERE `users`.`id` = `chat_members`.`user_id`
        AND `users`.`kind` = 'human'
        AND `users`.`active` = 1
        AND `users`.`deleted_at` IS NULL
    )
  );
--> statement-breakpoint
UPDATE `chat_members`
SET `role` = 'owner'
WHERE (`chat_id`, `user_id`) IN (
  SELECT `chat_id`, `owner_user_id`
  FROM `_0049_private_channel_owner_normalization`
  WHERE `owner_user_id` IS NOT NULL
)
  AND `left_at` IS NULL;
--> statement-breakpoint
UPDATE `chat_members`
SET `role` = 'admin'
WHERE `role` = 'owner'
  AND `chat_id` IN (SELECT `chat_id` FROM `_0049_private_channel_owner_normalization`)
  AND `user_id` IS NOT (
    SELECT `owner_user_id`
    FROM `_0049_private_channel_owner_normalization`
    WHERE `_0049_private_channel_owner_normalization`.`chat_id` = `chat_members`.`chat_id`
  );
--> statement-breakpoint
UPDATE `chats`
SET `owner_user_id` = (
  SELECT `owner_user_id`
  FROM `_0049_private_channel_owner_normalization`
  WHERE `_0049_private_channel_owner_normalization`.`chat_id` = `chats`.`id`
)
WHERE `kind` = 'private_channel';
--> statement-breakpoint
DROP TABLE `_0049_private_channel_owner_normalization`;
--> statement-breakpoint
CREATE TABLE `server_setup_state_account_free_local` (
  `id` INTEGER PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `schema_version` INTEGER NOT NULL DEFAULT 1 CHECK (`schema_version` > 0),
  `bootstrap_account_id` TEXT REFERENCES `accounts`(`id`) ON DELETE RESTRICT,
  `bootstrap_admin_user_id` TEXT REFERENCES `users`(`id`) ON DELETE RESTRICT,
  `registration_enabled` INTEGER CHECK (`registration_enabled` IS NULL OR `registration_enabled` IN (0, 1)),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    `bootstrap_admin_user_id` IS NULL
    OR `bootstrap_account_id` IS NOT NULL
    OR `registration_enabled` = 0
  )
);
--> statement-breakpoint
INSERT INTO `server_setup_state_account_free_local` (
  `rowid`, `id`, `schema_version`, `bootstrap_account_id`,
  `bootstrap_admin_user_id`, `registration_enabled`, `created_at`, `updated_at`
)
SELECT
  `rowid`, `id`, `schema_version`, `bootstrap_account_id`,
  `bootstrap_admin_user_id`, `registration_enabled`, `created_at`, `updated_at`
FROM `server_setup_state`;
--> statement-breakpoint
DROP TABLE `server_setup_state`;
--> statement-breakpoint
ALTER TABLE `server_setup_state_account_free_local` RENAME TO `server_setup_state`;
--> statement-breakpoint
CREATE TRIGGER `users_fts_ai`
AFTER INSERT ON `users`
WHEN `new`.`deleted_at` IS NULL
  AND `new`.`active` = 1
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
  AND `old`.`active` = 1
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
  AND `old`.`active` = 1
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
  AND `new`.`active` = 1
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