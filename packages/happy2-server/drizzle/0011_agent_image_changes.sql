CREATE TABLE `__new_agent_turns` (
  `user_message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `agent_user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `session_id` TEXT NOT NULL,
  `run_id` TEXT,
  `baseline_message_count` INTEGER CHECK (`baseline_message_count` IS NULL OR `baseline_message_count` >= 0),
  `last_session_event_id` TEXT,
  `stream_committed_text` TEXT NOT NULL DEFAULT '',
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'running', 'complete', 'failed')),
  `assistant_message_id` TEXT REFERENCES `messages`(`id`) ON DELETE SET NULL,
  `last_error` TEXT,
  `worker_id` TEXT,
  `lease_expires_at` TEXT,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TEXT,
  PRIMARY KEY (`user_message_id`, `agent_user_id`)
);
--> statement-breakpoint
INSERT INTO `__new_agent_turns` (
  `user_message_id`, `agent_user_id`, `chat_id`, `session_id`, `run_id`,
  `baseline_message_count`, `last_session_event_id`, `stream_committed_text`, `status`,
  `assistant_message_id`, `last_error`, `worker_id`, `lease_expires_at`, `created_at`,
  `updated_at`, `completed_at`
)
SELECT
  `user_message_id`, `agent_user_id`, `chat_id`, `session_id`, `run_id`,
  `baseline_message_count`, `last_session_event_id`, `stream_committed_text`, `status`,
  `assistant_message_id`, `last_error`, `worker_id`, `lease_expires_at`, `created_at`,
  `updated_at`, `completed_at`
FROM `agent_turns`;
--> statement-breakpoint
DROP TABLE `agent_turns`;
--> statement-breakpoint
ALTER TABLE `__new_agent_turns` RENAME TO `agent_turns`;
--> statement-breakpoint
CREATE INDEX `agent_turns_status_created_idx`
ON `agent_turns` (`status`, `created_at`, `user_message_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_turns_one_running_per_chat_idx`
ON `agent_turns` (`chat_id`, `agent_user_id`)
WHERE `status` = 'running';
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_turns_session_run_unique_idx`
ON `agent_turns` (`session_id`, `run_id`)
WHERE `run_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_turns_assistant_message_unique_idx`
ON `agent_turns` (`assistant_message_id`)
WHERE `assistant_message_id` IS NOT NULL;
