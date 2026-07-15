ALTER TABLE `agent_turns` ADD `last_session_event_id` TEXT;
--> statement-breakpoint
ALTER TABLE `agent_turns` ADD `stream_committed_text` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_turns_assistant_message_unique_idx`
ON `agent_turns` (`assistant_message_id`)
WHERE `assistant_message_id` IS NOT NULL;
--> statement-breakpoint
DROP TRIGGER `messages_fts_ai`;
--> statement-breakpoint
DROP TRIGGER `messages_fts_ad`;
--> statement-breakpoint
DROP TRIGGER `messages_fts_au_delete`;
--> statement-breakpoint
DROP TRIGGER `messages_fts_au_insert`;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ai`
AFTER INSERT ON `messages`
WHEN `new`.`deleted_at` IS NULL AND `new`.`published_at` IS NOT NULL
BEGIN
  INSERT INTO `messages_fts` (`rowid`, `text`)
  VALUES (`new`.`rowid`, COALESCE(`new`.`text`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_ad`
AFTER DELETE ON `messages`
WHEN `old`.`deleted_at` IS NULL AND `old`.`published_at` IS NOT NULL
BEGIN
  INSERT INTO `messages_fts` (`messages_fts`, `rowid`, `text`)
  VALUES ('delete', `old`.`rowid`, COALESCE(`old`.`text`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_au_delete`
AFTER UPDATE OF `text`, `deleted_at`, `published_at` ON `messages`
WHEN `old`.`deleted_at` IS NULL AND `old`.`published_at` IS NOT NULL
BEGIN
  INSERT INTO `messages_fts` (`messages_fts`, `rowid`, `text`)
  VALUES ('delete', `old`.`rowid`, COALESCE(`old`.`text`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `messages_fts_au_insert`
AFTER UPDATE OF `text`, `deleted_at`, `published_at` ON `messages`
WHEN `new`.`deleted_at` IS NULL AND `new`.`published_at` IS NOT NULL
BEGIN
  INSERT INTO `messages_fts` (`rowid`, `text`)
  VALUES (`new`.`rowid`, COALESCE(`new`.`text`, ''));
END;
