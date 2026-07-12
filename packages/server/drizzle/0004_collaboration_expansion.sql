ALTER TABLE `accounts` ADD COLUMN `ban_expires_at` TEXT;
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `ban_reason` TEXT;
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `banned_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `server_sync_state` ADD COLUMN `automation_event_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`automation_event_sequence` >= 0);
--> statement-breakpoint
ALTER TABLE `server_settings` ADD COLUMN `default_retention_mode` TEXT NOT NULL DEFAULT 'forever' CHECK (`default_retention_mode` IN ('forever', 'duration'));
--> statement-breakpoint
ALTER TABLE `server_settings` ADD COLUMN `default_retention_seconds` INTEGER CHECK (`default_retention_seconds` IS NULL OR `default_retention_seconds` > 0);
--> statement-breakpoint
ALTER TABLE `server_settings` ADD COLUMN `default_file_quota_bytes` INTEGER CHECK (`default_file_quota_bytes` IS NULL OR `default_file_quota_bytes` > 0);
--> statement-breakpoint
ALTER TABLE `server_settings` ADD COLUMN `max_upload_bytes` INTEGER CHECK (`max_upload_bytes` IS NULL OR `max_upload_bytes` > 0);
--> statement-breakpoint
ALTER TABLE `server_settings` ADD COLUMN `sync_event_retention_seconds` INTEGER NOT NULL DEFAULT 2592000 CHECK (`sync_event_retention_seconds` > 0);
--> statement-breakpoint
ALTER TABLE `server_settings` ADD COLUMN `chat_update_retention_seconds` INTEGER NOT NULL DEFAULT 2592000 CHECK (`chat_update_retention_seconds` > 0);
--> statement-breakpoint
ALTER TABLE `server_settings` ADD COLUMN `idempotency_retention_seconds` INTEGER NOT NULL DEFAULT 604800 CHECK (`idempotency_retention_seconds` > 0);
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `storage_provider` TEXT NOT NULL DEFAULT 'local' CHECK (length(trim(`storage_provider`)) > 0);
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `storage_key` TEXT;
--> statement-breakpoint
UPDATE `files` SET `storage_key` = `storage_name` WHERE `storage_key` IS NULL;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `checksum_sha256` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `access_scope` TEXT NOT NULL DEFAULT 'private' CHECK (`access_scope` IN ('private', 'chat', 'server', 'public'));
--> statement-breakpoint
UPDATE `files` SET `access_scope` = 'public' WHERE `is_public` = 1;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `upload_status` TEXT NOT NULL DEFAULT 'complete' CHECK (`upload_status` IN ('pending', 'uploading', 'processing', 'complete', 'failed', 'cancelled'));
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `scan_status` TEXT NOT NULL DEFAULT 'unscanned' CHECK (`scan_status` IN ('unscanned', 'pending', 'clean', 'infected', 'failed', 'skipped'));
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `scanned_at` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `scan_result_json` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `media_metadata_json` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `codec` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `preview_file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `thumbnail_file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `orphaned_at` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `retention_until` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `deleted_at` TEXT;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `deleted_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `files` ADD COLUMN `delete_reason` TEXT;
--> statement-breakpoint
CREATE TABLE `bot_identities` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL CHECK (length(trim(`name`)) > 0),
  `username` TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(`username`)) > 0),
  `description` TEXT,
  `photo_file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL,
  `owner_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `active` INTEGER NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_identities_active_username_unique_idx`
ON `bot_identities` (`username`)
WHERE `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `bot_identities_sync_sequence_idx` ON `bot_identities` (`sync_sequence`);
--> statement-breakpoint
CREATE TABLE `user_presence_settings` (
  `user_id` TEXT PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `availability` TEXT NOT NULL DEFAULT 'automatic' CHECK (`availability` IN ('automatic', 'online', 'away', 'dnd')),
  `custom_status_text` TEXT,
  `custom_status_emoji` TEXT,
  `status_expires_at` TEXT,
  `dnd_until` TEXT,
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `user_presence_settings_sync_idx` ON `user_presence_settings` (`sync_sequence`);
--> statement-breakpoint
CREATE INDEX `user_presence_settings_expiry_idx` ON `user_presence_settings` (`status_expires_at`, `dnd_until`);
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `dm_type` TEXT NOT NULL DEFAULT 'none' CHECK (`dm_type` IN ('none', 'direct', 'group'));
--> statement-breakpoint
UPDATE `chats` SET `dm_type` = 'direct' WHERE `kind` = 'dm';
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `visibility` TEXT NOT NULL DEFAULT 'private' CHECK (`visibility` IN ('direct', 'public', 'private'));
--> statement-breakpoint
UPDATE `chats`
SET `visibility` = CASE
  WHEN `kind` = 'dm' THEN 'direct'
  WHEN `kind` = 'public_channel' THEN 'public'
  ELSE 'private'
END;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `owner_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
UPDATE `chats`
SET `owner_user_id` = (
  SELECT `cm`.`user_id`
  FROM `chat_members` AS `cm`
  WHERE `cm`.`chat_id` = `chats`.`id`
    AND `cm`.`role` = 'owner'
    AND `cm`.`left_at` IS NULL
  ORDER BY `cm`.`joined_at`, `cm`.`user_id`
  LIMIT 1
)
WHERE `kind` != 'dm';
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `photo_file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `is_listed` INTEGER NOT NULL DEFAULT 1 CHECK (`is_listed` IN (0, 1));
--> statement-breakpoint
UPDATE `chats` SET `is_listed` = 0 WHERE `kind` = 'dm';
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `archived_at` TEXT;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `archived_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `archive_reason` TEXT;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `deleted_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `delete_reason` TEXT;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `retention_mode` TEXT NOT NULL DEFAULT 'inherit' CHECK (`retention_mode` IN ('inherit', 'forever', 'duration'));
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `retention_seconds` INTEGER CHECK (`retention_seconds` IS NULL OR `retention_seconds` > 0);
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `default_expiry_mode` TEXT NOT NULL DEFAULT 'none' CHECK (`default_expiry_mode` IN ('none', 'after_send', 'after_read'));
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `default_self_destruct_seconds` INTEGER CHECK (`default_self_destruct_seconds` IS NULL OR `default_self_destruct_seconds` > 0);
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `default_after_read_scope` TEXT NOT NULL DEFAULT 'any_reader' CHECK (`default_after_read_scope` IN ('any_reader', 'all_readers'));
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `lifecycle_version` INTEGER NOT NULL DEFAULT 1 CHECK (`lifecycle_version` > 0);
--> statement-breakpoint
CREATE INDEX `chats_visibility_archive_idx` ON `chats` (`visibility`, `archived_at`, `deleted_at`, `id`);
--> statement-breakpoint
CREATE INDEX `chats_dm_type_key_idx` ON `chats` (`dm_type`, `dm_key`) WHERE `kind` = 'dm';
--> statement-breakpoint
CREATE INDEX `chats_owner_active_idx` ON `chats` (`owner_user_id`, `archived_at`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `chats_search_cursor_idx` ON `chats` (`updated_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `users_search_cursor_idx` ON `users` (`created_at` DESC, `id` DESC);
--> statement-breakpoint
ALTER TABLE `chat_members` ADD COLUMN `last_read_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `chat_members` ADD COLUMN `last_read_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`last_read_sequence` >= 0);
--> statement-breakpoint
ALTER TABLE `chat_members` ADD COLUMN `last_read_pts` INTEGER NOT NULL DEFAULT 0 CHECK (`last_read_pts` >= 0);
--> statement-breakpoint
ALTER TABLE `chat_members` ADD COLUMN `last_read_at` TEXT;
--> statement-breakpoint
ALTER TABLE `chat_members` ADD COLUMN `unread_count` INTEGER NOT NULL DEFAULT 0 CHECK (`unread_count` >= 0);
--> statement-breakpoint
ALTER TABLE `chat_members` ADD COLUMN `mention_count` INTEGER NOT NULL DEFAULT 0 CHECK (`mention_count` >= 0);
--> statement-breakpoint
ALTER TABLE `chat_members` ADD COLUMN `invited_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `chat_members` ADD COLUMN `removed_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `chat_members_unread_idx` ON `chat_members` (`user_id`, `unread_count`, `mention_count`, `left_at`);
--> statement-breakpoint
ALTER TABLE `user_chat_preferences` ADD COLUMN `notification_level` TEXT NOT NULL DEFAULT 'all' CHECK (`notification_level` IN ('all', 'mentions', 'none'));
--> statement-breakpoint
ALTER TABLE `user_chat_preferences` ADD COLUMN `muted_until` TEXT;
--> statement-breakpoint
ALTER TABLE `user_chat_preferences` ADD COLUMN `notify_thread_replies` INTEGER NOT NULL DEFAULT 1 CHECK (`notify_thread_replies` IN (0, 1));
--> statement-breakpoint
ALTER TABLE `user_chat_preferences` ADD COLUMN `show_message_previews` INTEGER NOT NULL DEFAULT 1 CHECK (`show_message_previews` IN (0, 1));
--> statement-breakpoint
CREATE INDEX `user_chat_preferences_notifications_idx`
ON `user_chat_preferences` (`user_id`, `notification_level`, `muted_until`, `chat_id`);
--> statement-breakpoint
ALTER TABLE `threads` ADD COLUMN `last_reply_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `threads` ADD COLUMN `last_reply_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`last_reply_sequence` >= 0);
--> statement-breakpoint
ALTER TABLE `threads` ADD COLUMN `participant_count` INTEGER NOT NULL DEFAULT 0 CHECK (`participant_count` >= 0);
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `sender_bot_id` TEXT REFERENCES `bot_identities`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `content_json` TEXT;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 1 CHECK (`revision` > 0);
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `edited_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `edit_reason` TEXT;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `published_at` TEXT;
--> statement-breakpoint
UPDATE `messages` SET `published_at` = `created_at` WHERE `published_at` IS NULL;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `expiry_mode` TEXT NOT NULL DEFAULT 'none' CHECK (`expiry_mode` IN ('none', 'after_send', 'after_read'));
--> statement-breakpoint
UPDATE `messages` SET `expiry_mode` = 'after_send' WHERE `expires_at` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `self_destruct_seconds` INTEGER CHECK (`self_destruct_seconds` IS NULL OR `self_destruct_seconds` > 0);
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `after_read_scope` TEXT NOT NULL DEFAULT 'any_reader' CHECK (`after_read_scope` IN ('any_reader', 'all_readers'));
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `first_read_at` TEXT;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `hard_delete_at` TEXT;
--> statement-breakpoint
ALTER TABLE `messages` ADD COLUMN `delete_reason` TEXT;
--> statement-breakpoint
CREATE INDEX `messages_search_cursor_idx` ON `messages` (`created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `messages_active_chat_cursor_idx` ON `messages` (`chat_id`, `deleted_at`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `messages_hard_delete_idx` ON `messages` (`hard_delete_at`) WHERE `hard_delete_at` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `messages_bot_idx` ON `messages` (`sender_bot_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `message_revisions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `revision` INTEGER NOT NULL CHECK (`revision` > 0),
  `text` TEXT NOT NULL DEFAULT '',
  `content_json` TEXT,
  `edited_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `edit_reason` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`message_id`, `revision`)
);
--> statement-breakpoint
CREATE INDEX `message_revisions_message_created_idx` ON `message_revisions` (`message_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `message_mentions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('user', 'channel', 'here', 'everyone')),
  `mentioned_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `start_offset` INTEGER NOT NULL CHECK (`start_offset` >= 0),
  `length` INTEGER NOT NULL CHECK (`length` > 0),
  `raw_text` TEXT NOT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((`kind` = 'user' AND `mentioned_user_id` IS NOT NULL) OR (`kind` != 'user' AND `mentioned_user_id` IS NULL)),
  UNIQUE (`message_id`, `start_offset`, `length`)
);
--> statement-breakpoint
CREATE INDEX `message_mentions_user_message_idx` ON `message_mentions` (`mentioned_user_id`, `message_id`);
--> statement-breakpoint
CREATE INDEX `message_mentions_message_idx` ON `message_mentions` (`message_id`, `start_offset`);
--> statement-breakpoint
CREATE TABLE `message_receipts` (
  `message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `delivered_at` TEXT,
  `read_at` TEXT,
  `expiry_triggered_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `message_receipts_user_read_idx` ON `message_receipts` (`user_id`, `read_at`, `message_id`);
--> statement-breakpoint
CREATE INDEX `message_receipts_expiry_idx` ON `message_receipts` (`expiry_triggered_at`, `read_at`) WHERE `read_at` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `thread_user_states` (
  `thread_root_message_id` TEXT NOT NULL REFERENCES `threads`(`root_message_id`) ON DELETE CASCADE,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `subscribed` INTEGER NOT NULL DEFAULT 1 CHECK (`subscribed` IN (0, 1)),
  `notification_level` TEXT NOT NULL DEFAULT 'all' CHECK (`notification_level` IN ('all', 'mentions', 'none')),
  `last_read_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `last_read_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`last_read_sequence` >= 0),
  `unread_count` INTEGER NOT NULL DEFAULT 0 CHECK (`unread_count` >= 0),
  `mention_count` INTEGER NOT NULL DEFAULT 0 CHECK (`mention_count` >= 0),
  `last_participated_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`thread_root_message_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `thread_user_states_user_updated_idx` ON `thread_user_states` (`user_id`, `updated_at` DESC, `thread_root_message_id`);
--> statement-breakpoint
CREATE INDEX `thread_user_states_user_unread_idx` ON `thread_user_states` (`user_id`, `unread_count`, `mention_count`, `subscribed`);
--> statement-breakpoint
CREATE TABLE `thread_participants` (
  `thread_root_message_id` TEXT NOT NULL REFERENCES `threads`(`root_message_id`) ON DELETE CASCADE,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `reply_count` INTEGER NOT NULL DEFAULT 0 CHECK (`reply_count` >= 0),
  `first_participated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_participated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`thread_root_message_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `thread_participants_user_updated_idx` ON `thread_participants` (`user_id`, `last_participated_at` DESC);
--> statement-breakpoint
CREATE TABLE `notifications` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('mention', 'thread_reply', 'direct_message', 'reaction', 'call', 'system', 'moderation', 'automation')),
  `chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `message_id` TEXT REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `thread_root_message_id` TEXT REFERENCES `threads`(`root_message_id`) ON DELETE CASCADE,
  `actor_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `actor_bot_id` TEXT REFERENCES `bot_identities`(`id`) ON DELETE SET NULL,
  `payload_json` TEXT,
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `read_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TEXT
);
--> statement-breakpoint
CREATE INDEX `notifications_user_cursor_idx` ON `notifications` (`user_id`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `notifications_user_unread_idx` ON `notifications` (`user_id`, `read_at`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX `notifications_sync_sequence_idx` ON `notifications` (`sync_sequence`);
--> statement-breakpoint
CREATE TABLE `user_notification_preferences` (
  `user_id` TEXT PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `direct_messages` TEXT NOT NULL DEFAULT 'all' CHECK (`direct_messages` IN ('all', 'none')),
  `mentions` TEXT NOT NULL DEFAULT 'all' CHECK (`mentions` IN ('all', 'none')),
  `thread_replies` TEXT NOT NULL DEFAULT 'all' CHECK (`thread_replies` IN ('all', 'mentions', 'none')),
  `reactions` TEXT NOT NULL DEFAULT 'all' CHECK (`reactions` IN ('all', 'none')),
  `calls` TEXT NOT NULL DEFAULT 'all' CHECK (`calls` IN ('all', 'none')),
  `email_notifications` INTEGER NOT NULL DEFAULT 0 CHECK (`email_notifications` IN (0, 1)),
  `desktop_notifications` INTEGER NOT NULL DEFAULT 1 CHECK (`desktop_notifications` IN (0, 1)),
  `dnd_start_minutes` INTEGER CHECK (`dnd_start_minutes` IS NULL OR (`dnd_start_minutes` >= 0 AND `dnd_start_minutes` < 1440)),
  `dnd_end_minutes` INTEGER CHECK (`dnd_end_minutes` IS NULL OR (`dnd_end_minutes` >= 0 AND `dnd_end_minutes` < 1440)),
  `timezone` TEXT,
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `user_notification_preferences_sync_idx` ON `user_notification_preferences` (`sync_sequence`);
--> statement-breakpoint
CREATE TABLE `scheduled_messages` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `sender_bot_id` TEXT REFERENCES `bot_identities`(`id`) ON DELETE SET NULL,
  `text` TEXT NOT NULL DEFAULT '',
  `content_json` TEXT,
  `quoted_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `thread_root_message_id` TEXT REFERENCES `threads`(`root_message_id`) ON DELETE SET NULL,
  `forwarded_from_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `scheduled_for` TEXT NOT NULL,
  `timezone` TEXT,
  `status` TEXT NOT NULL DEFAULT 'scheduled' CHECK (`status` IN ('scheduled', 'publishing', 'published', 'cancelled', 'failed')),
  `published_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `last_error` TEXT,
  `client_mutation_id` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` TEXT,
  `published_at` TEXT
);
--> statement-breakpoint
CREATE INDEX `scheduled_messages_due_idx` ON `scheduled_messages` (`status`, `scheduled_for`, `id`);
--> statement-breakpoint
CREATE INDEX `scheduled_messages_creator_idx` ON `scheduled_messages` (`created_by_user_id`, `created_at` DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_messages_client_mutation_unique_idx`
ON `scheduled_messages` (`created_by_user_id`, `client_mutation_id`)
WHERE `client_mutation_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `scheduled_message_attachments` (
  `scheduled_message_id` TEXT NOT NULL REFERENCES `scheduled_messages`(`id`) ON DELETE CASCADE,
  `file_id` TEXT NOT NULL REFERENCES `files`(`id`) ON DELETE CASCADE,
  `position` INTEGER NOT NULL DEFAULT 0 CHECK (`position` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`scheduled_message_id`, `file_id`),
  UNIQUE (`scheduled_message_id`, `position`)
);
--> statement-breakpoint
CREATE INDEX `scheduled_message_attachments_file_idx` ON `scheduled_message_attachments` (`file_id`, `scheduled_message_id`);
--> statement-breakpoint
CREATE TABLE `message_forward_metadata` (
  `message_id` TEXT PRIMARY KEY NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `source_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `source_chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE SET NULL,
  `source_sender_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `source_sender_bot_id` TEXT REFERENCES `bot_identities`(`id`) ON DELETE SET NULL,
  `source_sender_name` TEXT,
  `source_created_at` TEXT,
  `source_text_snapshot` TEXT,
  `forwarded_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `message_forward_metadata_source_idx` ON `message_forward_metadata` (`source_message_id`, `message_id`);
--> statement-breakpoint
CREATE TABLE `chat_pins` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `pinned_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`chat_id`, `message_id`)
);
--> statement-breakpoint
CREATE INDEX `chat_pins_chat_created_idx` ON `chat_pins` (`chat_id`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE TABLE `chat_bookmarks` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('link', 'message', 'file')),
  `title` TEXT NOT NULL CHECK (length(trim(`title`)) > 0),
  `url` TEXT,
  `message_id` TEXT REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `file_id` TEXT REFERENCES `files`(`id`) ON DELETE CASCADE,
  `emoji` TEXT,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (`kind` = 'link' AND `url` IS NOT NULL AND `message_id` IS NULL AND `file_id` IS NULL)
    OR (`kind` = 'message' AND `url` IS NULL AND `message_id` IS NOT NULL AND `file_id` IS NULL)
    OR (`kind` = 'file' AND `url` IS NULL AND `message_id` IS NULL AND `file_id` IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX `chat_bookmarks_chat_order_idx` ON `chat_bookmarks` (`chat_id`, `sort_order`, `id`);
--> statement-breakpoint
CREATE TABLE `user_bookmarks` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `message_id` TEXT REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `file_id` TEXT REFERENCES `files`(`id`) ON DELETE CASCADE,
  `url` TEXT,
  `title` TEXT,
  `note` TEXT,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (((`message_id` IS NOT NULL) + (`file_id` IS NOT NULL) + (`url` IS NOT NULL)) = 1)
);
--> statement-breakpoint
CREATE INDEX `user_bookmarks_user_order_idx` ON `user_bookmarks` (`user_id`, `sort_order`, `created_at` DESC, `id`);
--> statement-breakpoint
ALTER TABLE `custom_emojis` ADD COLUMN `deleted_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `custom_emojis` ADD COLUMN `promoted_at` TEXT;
--> statement-breakpoint
ALTER TABLE `custom_emojis` ADD COLUMN `promoted_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `reactions` ADD COLUMN `custom_emoji_name_snapshot` TEXT;
--> statement-breakpoint
ALTER TABLE `reactions` ADD COLUMN `custom_emoji_file_id_snapshot` TEXT;
--> statement-breakpoint
UPDATE `reactions`
SET
  `custom_emoji_name_snapshot` = (
    SELECT `ce`.`name` FROM `custom_emojis` AS `ce` WHERE `ce`.`id` = `reactions`.`custom_emoji_id`
  ),
  `custom_emoji_file_id_snapshot` = (
    SELECT `ce`.`file_id` FROM `custom_emojis` AS `ce` WHERE `ce`.`id` = `reactions`.`custom_emoji_id`
  )
WHERE `custom_emoji_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `reactions_custom_emoji_message_idx` ON `reactions` (`custom_emoji_id`, `message_id`);
--> statement-breakpoint
CREATE TABLE `custom_emoji_revisions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `custom_emoji_id` TEXT NOT NULL REFERENCES `custom_emojis`(`id`) ON DELETE CASCADE,
  `name` TEXT NOT NULL,
  `file_id` TEXT NOT NULL,
  `changed_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `change_kind` TEXT NOT NULL CHECK (`change_kind` IN ('created', 'renamed', 'replaced', 'deleted', 'restored')),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `custom_emoji_revisions_emoji_created_idx` ON `custom_emoji_revisions` (`custom_emoji_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `message_search_documents` (
  `message_id` TEXT PRIMARY KEY NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `normalized_text` TEXT NOT NULL,
  `normalized_length` INTEGER NOT NULL CHECK (`normalized_length` >= 0),
  `gram_count` INTEGER NOT NULL DEFAULT 0 CHECK (`gram_count` >= 0),
  `indexed_revision` INTEGER NOT NULL CHECK (`indexed_revision` > 0),
  `content_hash` TEXT,
  `message_created_at` TEXT NOT NULL,
  `indexed_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `message_search_documents_chat_cursor_idx`
ON `message_search_documents` (`chat_id`, `message_created_at` DESC, `message_id` DESC);
--> statement-breakpoint
CREATE INDEX `message_search_documents_global_cursor_idx`
ON `message_search_documents` (`message_created_at` DESC, `message_id` DESC);
--> statement-breakpoint
CREATE TABLE `message_search_ngrams` (
  `gram` TEXT NOT NULL COLLATE NOCASE CHECK (length(`gram`) BETWEEN 1 AND 3),
  `message_id` TEXT NOT NULL REFERENCES `message_search_documents`(`message_id`) ON DELETE CASCADE,
  `occurrences` INTEGER NOT NULL DEFAULT 1 CHECK (`occurrences` > 0),
  PRIMARY KEY (`gram`, `message_id`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `message_search_ngrams_message_idx` ON `message_search_ngrams` (`message_id`, `gram`);
--> statement-breakpoint
INSERT INTO `message_search_documents` (
  `message_id`,
  `chat_id`,
  `normalized_text`,
  `normalized_length`,
  `gram_count`,
  `indexed_revision`,
  `message_created_at`
)
SELECT
  `id`,
  `chat_id`,
  lower(trim(`text`)),
  length(lower(trim(`text`))),
  CASE WHEN length(lower(trim(`text`))) >= 3 THEN length(lower(trim(`text`))) - 2 ELSE length(lower(trim(`text`))) END,
  `revision`,
  `created_at`
FROM `messages`
WHERE `deleted_at` IS NULL AND length(trim(`text`)) > 0;
--> statement-breakpoint
WITH RECURSIVE `gram_positions` (`message_id`, `normalized_text`, `position`) AS (
  SELECT `message_id`, `normalized_text`, 1
  FROM `message_search_documents`
  WHERE `normalized_length` >= 3
  UNION ALL
  SELECT `message_id`, `normalized_text`, `position` + 1
  FROM `gram_positions`
  WHERE `position` + 2 < length(`normalized_text`)
)
INSERT INTO `message_search_ngrams` (`gram`, `message_id`, `occurrences`)
SELECT substr(`normalized_text`, `position`, 3), `message_id`, count(*)
FROM `gram_positions`
GROUP BY `message_id`, substr(`normalized_text`, `position`, 3);
--> statement-breakpoint
INSERT INTO `message_search_ngrams` (`gram`, `message_id`, `occurrences`)
SELECT `normalized_text`, `message_id`, 1
FROM `message_search_documents`
WHERE `normalized_length` BETWEEN 1 AND 2;
--> statement-breakpoint
CREATE TABLE `search_index_state` (
  `entity_kind` TEXT PRIMARY KEY NOT NULL CHECK (`entity_kind` IN ('message', 'chat', 'user', 'bot', 'file')),
  `version` INTEGER NOT NULL DEFAULT 1 CHECK (`version` > 0),
  `status` TEXT NOT NULL DEFAULT 'ready' CHECK (`status` IN ('ready', 'rebuilding', 'failed')),
  `last_indexed_id` TEXT,
  `last_error` TEXT,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `search_index_state` (`entity_kind`) VALUES ('message'), ('chat'), ('user');
--> statement-breakpoint
CREATE INDEX `files_cleanup_idx` ON `files` (`upload_status`, `deleted_at`, `orphaned_at`, `retention_until`);
--> statement-breakpoint
CREATE INDEX `files_checksum_idx` ON `files` (`checksum_sha256`) WHERE `checksum_sha256` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `files_scan_idx` ON `files` (`scan_status`, `created_at`, `id`);
--> statement-breakpoint
CREATE TABLE `file_upload_sessions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL,
  `storage_provider` TEXT NOT NULL DEFAULT 'local' CHECK (length(trim(`storage_provider`)) > 0),
  `storage_key` TEXT NOT NULL,
  `original_name` TEXT NOT NULL,
  `content_type` TEXT NOT NULL,
  `expected_size` INTEGER NOT NULL CHECK (`expected_size` >= 0),
  `received_size` INTEGER NOT NULL DEFAULT 0 CHECK (`received_size` >= 0),
  `chunk_size` INTEGER NOT NULL CHECK (`chunk_size` > 0),
  `checksum_sha256` TEXT,
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'uploading', 'assembling', 'complete', 'failed', 'cancelled', 'expired')),
  `client_mutation_id` TEXT,
  `metadata_json` TEXT,
  `last_error` TEXT,
  `expires_at` TEXT NOT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TEXT,
  UNIQUE (`storage_provider`, `storage_key`),
  CHECK (`received_size` <= `expected_size`)
);
--> statement-breakpoint
CREATE INDEX `file_upload_sessions_user_created_idx` ON `file_upload_sessions` (`user_id`, `created_at` DESC, `id`);
--> statement-breakpoint
CREATE INDEX `file_upload_sessions_expiry_idx` ON `file_upload_sessions` (`status`, `expires_at`, `id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_upload_sessions_client_mutation_unique_idx`
ON `file_upload_sessions` (`user_id`, `client_mutation_id`)
WHERE `client_mutation_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `file_upload_parts` (
  `upload_session_id` TEXT NOT NULL REFERENCES `file_upload_sessions`(`id`) ON DELETE CASCADE,
  `part_number` INTEGER NOT NULL CHECK (`part_number` >= 0),
  `byte_offset` INTEGER NOT NULL CHECK (`byte_offset` >= 0),
  `size` INTEGER NOT NULL CHECK (`size` > 0),
  `checksum_sha256` TEXT,
  `storage_etag` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`upload_session_id`, `part_number`),
  UNIQUE (`upload_session_id`, `byte_offset`)
);
--> statement-breakpoint
CREATE TABLE `file_access_grants` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `file_id` TEXT NOT NULL REFERENCES `files`(`id`) ON DELETE CASCADE,
  `principal_type` TEXT NOT NULL CHECK (`principal_type` IN ('user', 'chat', 'server', 'custom_emoji')),
  `principal_id` TEXT NOT NULL,
  `source_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `granted_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TEXT,
  UNIQUE (`file_id`, `principal_type`, `principal_id`, `source_message_id`)
);
--> statement-breakpoint
CREATE INDEX `file_access_grants_principal_idx` ON `file_access_grants` (`principal_type`, `principal_id`, `file_id`);
--> statement-breakpoint
CREATE INDEX `file_access_grants_file_idx` ON `file_access_grants` (`file_id`, `expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_access_grants_without_source_unique_idx`
ON `file_access_grants` (`file_id`, `principal_type`, `principal_id`)
WHERE `source_message_id` IS NULL;
--> statement-breakpoint
CREATE TABLE `user_storage_quotas` (
  `user_id` TEXT PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `quota_bytes` INTEGER CHECK (`quota_bytes` IS NULL OR `quota_bytes` > 0),
  `used_bytes` INTEGER NOT NULL DEFAULT 0 CHECK (`used_bytes` >= 0),
  `reserved_bytes` INTEGER NOT NULL DEFAULT 0 CHECK (`reserved_bytes` >= 0),
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `file_scan_events` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `file_id` TEXT NOT NULL REFERENCES `files`(`id`) ON DELETE CASCADE,
  `scanner` TEXT NOT NULL,
  `status` TEXT NOT NULL CHECK (`status` IN ('pending', 'clean', 'infected', 'failed', 'skipped')),
  `result_json` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `file_scan_events_file_created_idx` ON `file_scan_events` (`file_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `file_derivatives` (
  `source_file_id` TEXT NOT NULL REFERENCES `files`(`id`) ON DELETE CASCADE,
  `derived_file_id` TEXT NOT NULL REFERENCES `files`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('thumbnail', 'preview', 'poster', 'transcode')),
  `variant` TEXT NOT NULL DEFAULT 'default',
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`source_file_id`, `kind`, `variant`),
  UNIQUE (`derived_file_id`)
);
--> statement-breakpoint
CREATE TABLE `file_processing_jobs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `file_id` TEXT NOT NULL REFERENCES `files`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('probe', 'thumbnail', 'preview', 'transcode', 'scan', 'cleanup')),
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'running', 'complete', 'failed', 'cancelled')),
  `input_json` TEXT,
  `result_json` TEXT,
  `attempts` INTEGER NOT NULL DEFAULT 0 CHECK (`attempts` >= 0),
  `run_after` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `locked_at` TEXT,
  `locked_by` TEXT,
  `last_error` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TEXT
);
--> statement-breakpoint
CREATE INDEX `file_processing_jobs_due_idx` ON `file_processing_jobs` (`status`, `run_after`, `id`);
--> statement-breakpoint
CREATE TABLE `integrations` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('app', 'incoming_webhook', 'outgoing_webhook', 'slash_command', 'service_account')),
  `name` TEXT NOT NULL CHECK (length(trim(`name`)) > 0),
  `description` TEXT,
  `bot_id` TEXT REFERENCES `bot_identities`(`id`) ON DELETE SET NULL,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `scopes_json` TEXT NOT NULL DEFAULT '[]',
  `config_json` TEXT,
  `active` INTEGER NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `sync_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sync_sequence` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` TEXT
);
--> statement-breakpoint
CREATE INDEX `integrations_active_kind_idx` ON `integrations` (`active`, `kind`, `deleted_at`);
--> statement-breakpoint
CREATE INDEX `integrations_sync_idx` ON `integrations` (`sync_sequence`);
--> statement-breakpoint
CREATE TABLE `api_credentials` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `integration_id` TEXT REFERENCES `integrations`(`id`) ON DELETE CASCADE,
  `user_id` TEXT REFERENCES `users`(`id`) ON DELETE CASCADE,
  `bot_id` TEXT REFERENCES `bot_identities`(`id`) ON DELETE CASCADE,
  `name` TEXT NOT NULL,
  `token_prefix` TEXT NOT NULL,
  `token_hash` TEXT NOT NULL UNIQUE,
  `scopes_json` TEXT NOT NULL DEFAULT '[]',
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `expires_at` TEXT,
  `last_used_at` TEXT,
  `revoked_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (((`integration_id` IS NOT NULL) + (`user_id` IS NOT NULL) + (`bot_id` IS NOT NULL)) = 1)
);
--> statement-breakpoint
CREATE INDEX `api_credentials_prefix_idx` ON `api_credentials` (`token_prefix`, `revoked_at`, `expires_at`);
--> statement-breakpoint
CREATE TABLE `webhook_subscriptions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `integration_id` TEXT NOT NULL REFERENCES `integrations`(`id`) ON DELETE CASCADE,
  `direction` TEXT NOT NULL CHECK (`direction` IN ('incoming', 'outgoing')),
  `chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `url` TEXT,
  `token_hash` TEXT,
  `signing_secret_ciphertext` TEXT,
  `event_types_json` TEXT NOT NULL DEFAULT '[]',
  `active` INTEGER NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (`direction` = 'incoming' AND `token_hash` IS NOT NULL)
    OR (`direction` = 'outgoing' AND `url` IS NOT NULL AND `signing_secret_ciphertext` IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_subscriptions_token_unique_idx` ON `webhook_subscriptions` (`token_hash`) WHERE `token_hash` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `webhook_subscriptions_outgoing_idx` ON `webhook_subscriptions` (`active`, `direction`, `chat_id`);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `subscription_id` TEXT NOT NULL REFERENCES `webhook_subscriptions`(`id`) ON DELETE CASCADE,
  `event_id` TEXT NOT NULL,
  `event_type` TEXT NOT NULL,
  `payload_json` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'delivering', 'delivered', 'failed', 'cancelled')),
  `attempts` INTEGER NOT NULL DEFAULT 0 CHECK (`attempts` >= 0),
  `next_attempt_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `response_status` INTEGER,
  `response_body` TEXT,
  `last_error` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delivered_at` TEXT,
  UNIQUE (`subscription_id`, `event_id`)
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_due_idx` ON `webhook_deliveries` (`status`, `next_attempt_at`, `id`);
--> statement-breakpoint
CREATE TABLE `slash_commands` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `integration_id` TEXT NOT NULL REFERENCES `integrations`(`id`) ON DELETE CASCADE,
  `command` TEXT NOT NULL COLLATE NOCASE CHECK (length(`command`) > 1 AND substr(`command`, 1, 1) = '/'),
  `description` TEXT,
  `usage_hint` TEXT,
  `handler_url` TEXT NOT NULL,
  `active` INTEGER NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slash_commands_active_command_unique_idx`
ON `slash_commands` (`command`)
WHERE `active` = 1;
--> statement-breakpoint
CREATE TABLE `automations` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL CHECK (length(trim(`name`)) > 0),
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `bot_id` TEXT REFERENCES `bot_identities`(`id`) ON DELETE SET NULL,
  `chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `trigger_type` TEXT NOT NULL CHECK (`trigger_type` IN ('schedule', 'event', 'webhook')),
  `trigger_config_json` TEXT NOT NULL DEFAULT '{}',
  `action_type` TEXT NOT NULL DEFAULT 'send_message' CHECK (`action_type` IN ('send_message', 'call_webhook', 'moderate')),
  `action_config_json` TEXT NOT NULL DEFAULT '{}',
  `timezone` TEXT,
  `next_run_at` TEXT,
  `active` INTEGER NOT NULL DEFAULT 1 CHECK (`active` IN (0, 1)),
  `created_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`created_sequence` >= 0),
  `last_run_at` TEXT,
  `last_error` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` TEXT
);
--> statement-breakpoint
CREATE INDEX `automations_due_idx` ON `automations` (`active`, `trigger_type`, `next_run_at`, `id`);
--> statement-breakpoint
CREATE INDEX `automations_chat_idx` ON `automations` (`chat_id`, `active`, `id`);
--> statement-breakpoint
CREATE TABLE `automation_runs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `automation_id` TEXT NOT NULL REFERENCES `automations`(`id`) ON DELETE CASCADE,
  `trigger_event_id` TEXT,
  `scheduled_for` TEXT,
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  `attempts` INTEGER NOT NULL DEFAULT 0 CHECK (`attempts` >= 0),
  `input_json` TEXT,
  `result_json` TEXT,
  `last_error` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` TEXT,
  `completed_at` TEXT,
  UNIQUE (`automation_id`, `trigger_event_id`)
);
--> statement-breakpoint
CREATE INDEX `automation_runs_status_created_idx` ON `automation_runs` (`status`, `created_at`, `id`);
--> statement-breakpoint
CREATE TABLE `calls` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `kind` TEXT NOT NULL DEFAULT 'audio' CHECK (`kind` IN ('audio', 'video')),
  `status` TEXT NOT NULL DEFAULT 'ringing' CHECK (`status` IN ('ringing', 'active', 'ended', 'cancelled', 'failed')),
  `provider` TEXT NOT NULL DEFAULT 'webrtc',
  `provider_room_id` TEXT,
  `provider_data_json` TEXT,
  `started_at` TEXT,
  `ended_at` TEXT,
  `end_reason` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `calls_chat_created_idx` ON `calls` (`chat_id`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `calls_active_idx` ON `calls` (`status`, `updated_at`, `id`);
--> statement-breakpoint
CREATE TABLE `call_participants` (
  `call_id` TEXT NOT NULL REFERENCES `calls`(`id`) ON DELETE CASCADE,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `invited_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `status` TEXT NOT NULL DEFAULT 'invited' CHECK (`status` IN ('invited', 'ringing', 'joined', 'declined', 'left', 'missed', 'removed')),
  `invited_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ringing_at` TEXT,
  `joined_at` TEXT,
  `left_at` TEXT,
  `last_seen_at` TEXT,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`call_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `call_participants_user_status_idx` ON `call_participants` (`user_id`, `status`, `updated_at` DESC);
--> statement-breakpoint
CREATE TABLE `call_events` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `call_id` TEXT NOT NULL REFERENCES `calls`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('created', 'ringing', 'joined', 'left', 'declined', 'missed', 'ended', 'failed')),
  `actor_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `target_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `payload_json` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `call_events_call_created_idx` ON `call_events` (`call_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE TABLE `call_credential_leases` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `call_id` TEXT NOT NULL REFERENCES `calls`(`id`) ON DELETE CASCADE,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `provider` TEXT NOT NULL,
  `credential_username` TEXT NOT NULL,
  `expires_at` TEXT NOT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` TEXT
);
--> statement-breakpoint
CREATE INDEX `call_credential_leases_expiry_idx` ON `call_credential_leases` (`expires_at`, `revoked_at`);
--> statement-breakpoint
ALTER TABLE `server_sync_state` ADD COLUMN `min_recoverable_sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`min_recoverable_sequence` >= 0);
--> statement-breakpoint
ALTER TABLE `server_sync_state` ADD COLUMN `last_compacted_at` TEXT;
--> statement-breakpoint
ALTER TABLE `server_sync_state` ADD COLUMN `compaction_version` INTEGER NOT NULL DEFAULT 0 CHECK (`compaction_version` >= 0);
--> statement-breakpoint
ALTER TABLE `client_mutations` ADD COLUMN `expires_at` TEXT;
--> statement-breakpoint
ALTER TABLE `client_mutations` ADD COLUMN `last_accessed_at` TEXT;
--> statement-breakpoint
CREATE INDEX `client_mutations_expiry_idx` ON `client_mutations` (`expires_at`, `created_at`);
--> statement-breakpoint
CREATE TABLE `sync_consumers` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `device_id` TEXT NOT NULL,
  `generation` TEXT NOT NULL,
  `sequence` INTEGER NOT NULL DEFAULT 0 CHECK (`sequence` >= 0),
  `last_seen_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` TEXT,
  UNIQUE (`user_id`, `device_id`)
);
--> statement-breakpoint
CREATE INDEX `sync_consumers_active_cursor_idx` ON `sync_consumers` (`generation`, `sequence`, `last_seen_at`) WHERE `revoked_at` IS NULL;
--> statement-breakpoint
CREATE TABLE `sync_compactions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `generation` TEXT NOT NULL,
  `previous_min_sequence` INTEGER NOT NULL CHECK (`previous_min_sequence` >= 0),
  `new_min_sequence` INTEGER NOT NULL CHECK (`new_min_sequence` >= 0),
  `events_deleted` INTEGER NOT NULL DEFAULT 0 CHECK (`events_deleted` >= 0),
  `mutations_deleted` INTEGER NOT NULL DEFAULT 0 CHECK (`mutations_deleted` >= 0),
  `started_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TEXT,
  `details_json` TEXT,
  CHECK (`new_min_sequence` >= `previous_min_sequence`)
);
--> statement-breakpoint
CREATE INDEX `sync_compactions_completed_idx` ON `sync_compactions` (`completed_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE TABLE `chat_sync_compactions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `previous_min_pts` INTEGER NOT NULL CHECK (`previous_min_pts` >= 0),
  `new_min_pts` INTEGER NOT NULL CHECK (`new_min_pts` >= 0),
  `updates_deleted` INTEGER NOT NULL DEFAULT 0 CHECK (`updates_deleted` >= 0),
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (`new_min_pts` >= `previous_min_pts`)
);
--> statement-breakpoint
CREATE INDEX `chat_sync_compactions_chat_created_idx` ON `chat_sync_compactions` (`chat_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `principal_type` TEXT NOT NULL CHECK (`principal_type` IN ('user', 'integration', 'system')),
  `principal_id` TEXT NOT NULL,
  `scope` TEXT NOT NULL,
  `idempotency_key` TEXT NOT NULL,
  `request_hash` TEXT NOT NULL,
  `status` TEXT NOT NULL DEFAULT 'in_progress' CHECK (`status` IN ('in_progress', 'completed', 'failed')),
  `response_status` INTEGER,
  `response_json` TEXT,
  `locked_until` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TEXT NOT NULL,
  UNIQUE (`principal_type`, `principal_id`, `scope`, `idempotency_key`)
);
--> statement-breakpoint
CREATE INDEX `idempotency_keys_expiry_idx` ON `idempotency_keys` (`expires_at`, `status`);
--> statement-breakpoint
CREATE TABLE `audit_log_entries` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `actor_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `actor_integration_id` TEXT REFERENCES `integrations`(`id`) ON DELETE SET NULL,
  `action` TEXT NOT NULL,
  `target_type` TEXT NOT NULL,
  `target_id` TEXT,
  `chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE SET NULL,
  `before_json` TEXT,
  `after_json` TEXT,
  `metadata_json` TEXT,
  `client_ip` TEXT,
  `device` TEXT,
  `app_version` TEXT,
  `user_agent` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `audit_log_entries_cursor_idx` ON `audit_log_entries` (`created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `audit_log_entries_actor_idx` ON `audit_log_entries` (`actor_user_id`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX `audit_log_entries_target_idx` ON `audit_log_entries` (`target_type`, `target_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `account_bans` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `account_id` TEXT NOT NULL REFERENCES `accounts`(`id`) ON DELETE CASCADE,
  `banned_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `reason` TEXT,
  `banned_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TEXT,
  `revoked_at` TEXT,
  `revoked_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `revoke_reason` TEXT
);
--> statement-breakpoint
CREATE INDEX `account_bans_account_active_idx` ON `account_bans` (`account_id`, `revoked_at`, `expires_at`);
--> statement-breakpoint
CREATE TABLE `moderation_reports` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `reported_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `target_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE SET NULL,
  `message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL,
  `reason` TEXT NOT NULL,
  `details` TEXT,
  `status` TEXT NOT NULL DEFAULT 'open' CHECK (`status` IN ('open', 'reviewing', 'resolved', 'dismissed')),
  `assigned_to_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `resolution` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` TEXT,
  CHECK (((`target_user_id` IS NOT NULL) + (`chat_id` IS NOT NULL) + (`message_id` IS NOT NULL) + (`file_id` IS NOT NULL)) >= 1)
);
--> statement-breakpoint
CREATE INDEX `moderation_reports_queue_idx` ON `moderation_reports` (`status`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `moderation_reports_reporter_idx` ON `moderation_reports` (`reported_by_user_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `moderation_actions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `report_id` TEXT REFERENCES `moderation_reports`(`id`) ON DELETE SET NULL,
  `actor_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `target_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE SET NULL,
  `message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL,
  `action` TEXT NOT NULL CHECK (`action` IN ('warn', 'restrict', 'remove_message', 'remove_file', 'ban', 'unban', 'delete_user')),
  `reason` TEXT,
  `metadata_json` TEXT,
  `automation_run_id` TEXT UNIQUE REFERENCES `automation_runs`(`id`) ON DELETE SET NULL,
  `expires_at` TEXT,
  `revoked_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `moderation_actions_target_idx` ON `moderation_actions` (`target_user_id`, `created_at` DESC);
--> statement-breakpoint
CREATE INDEX `moderation_actions_file_idx` ON `moderation_actions` (`file_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `data_export_jobs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `requested_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `kind` TEXT NOT NULL CHECK (`kind` IN ('user_data', 'server_data', 'audit_log', 'chat_history')),
  `target_id` TEXT,
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'running', 'complete', 'failed', 'cancelled', 'expired')),
  `output_file_id` TEXT REFERENCES `files`(`id`) ON DELETE SET NULL,
  `options_json` TEXT,
  `last_error` TEXT,
  `expires_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `started_at` TEXT,
  `completed_at` TEXT
);
--> statement-breakpoint
CREATE INDEX `data_export_jobs_queue_idx` ON `data_export_jobs` (`status`, `created_at`, `id`);
--> statement-breakpoint
CREATE TABLE `backup_records` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `storage_provider` TEXT NOT NULL,
  `storage_key` TEXT NOT NULL,
  `checksum_sha256` TEXT,
  `size` INTEGER CHECK (`size` IS NULL OR `size` >= 0),
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'running', 'complete', 'failed', 'deleted')),
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `metadata_json` TEXT,
  `last_error` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TEXT,
  `retention_until` TEXT,
  UNIQUE (`storage_provider`, `storage_key`)
);
--> statement-breakpoint
CREATE INDEX `backup_records_retention_idx` ON `backup_records` (`status`, `retention_until`, `id`);
--> statement-breakpoint
CREATE TABLE `retention_runs` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `scope` TEXT NOT NULL CHECK (`scope` IN ('messages', 'files', 'sync', 'idempotency', 'audit', 'backups')),
  `status` TEXT NOT NULL DEFAULT 'running' CHECK (`status` IN ('running', 'complete', 'failed')),
  `items_examined` INTEGER NOT NULL DEFAULT 0 CHECK (`items_examined` >= 0),
  `items_deleted` INTEGER NOT NULL DEFAULT 0 CHECK (`items_deleted` >= 0),
  `details_json` TEXT,
  `last_error` TEXT,
  `started_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TEXT
);
--> statement-breakpoint
CREATE INDEX `retention_runs_scope_started_idx` ON `retention_runs` (`scope`, `started_at` DESC);
--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
  `principal_key` TEXT NOT NULL,
  `action` TEXT NOT NULL,
  `window_started_at` TEXT NOT NULL,
  `window_seconds` INTEGER NOT NULL CHECK (`window_seconds` > 0),
  `request_count` INTEGER NOT NULL DEFAULT 0 CHECK (`request_count` >= 0),
  `blocked_until` TEXT,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`principal_key`, `action`, `window_started_at`)
);
--> statement-breakpoint
CREATE INDEX `rate_limit_buckets_cleanup_idx` ON `rate_limit_buckets` (`window_started_at`, `blocked_until`);
