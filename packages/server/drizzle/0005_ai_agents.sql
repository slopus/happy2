CREATE TABLE `agent_rig_bindings` (
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `session_id` TEXT NOT NULL,
  `cwd` TEXT NOT NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `chat_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_rig_bindings_session_unique_idx` ON `agent_rig_bindings` (`session_id`);
--> statement-breakpoint
CREATE TABLE `agent_turns` (
  `user_message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `agent_user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `session_id` TEXT NOT NULL REFERENCES `agent_rig_bindings`(`session_id`) ON DELETE CASCADE,
  `run_id` TEXT,
  `baseline_message_count` INTEGER CHECK (`baseline_message_count` IS NULL OR `baseline_message_count` >= 0),
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
