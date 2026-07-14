CREATE TABLE `agent_images` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `name` TEXT NOT NULL,
  `dockerfile` TEXT NOT NULL,
  `definition_hash` TEXT NOT NULL UNIQUE,
  `docker_tag` TEXT NOT NULL UNIQUE,
  `build_context` TEXT,
  `builtin_key` TEXT,
  `status` TEXT NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending', 'building', 'ready', 'failed')),
  `build_attempt` INTEGER NOT NULL DEFAULT 0 CHECK (`build_attempt` >= 0),
  `build_progress` INTEGER NOT NULL DEFAULT 0 CHECK (`build_progress` BETWEEN 0 AND 100),
  `build_log` TEXT NOT NULL DEFAULT '',
  `build_log_truncated` INTEGER NOT NULL DEFAULT 0 CHECK (`build_log_truncated` IN (0, 1)),
  `last_build_log_line` TEXT,
  `build_log_updated_at` TEXT,
  `docker_image_id` TEXT,
  `last_error` TEXT,
  `build_requested_at` TEXT,
  `build_started_at` TEXT,
  `ready_at` TEXT,
  `worker_id` TEXT,
  `lease_expires_at` TEXT,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (`status` = 'ready' AND `docker_image_id` IS NOT NULL AND `ready_at` IS NOT NULL)
    OR (`status` != 'ready' AND `ready_at` IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX `agent_images_status_requested_idx`
ON `agent_images` (`status`, `build_requested_at`, `created_at`);
--> statement-breakpoint
CREATE TABLE `agent_image_settings` (
  `id` INTEGER PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `default_image_id` TEXT REFERENCES `agent_images`(`id`) ON DELETE RESTRICT,
  `updated_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `agent_image_settings` (`id`) VALUES (1);
--> statement-breakpoint
CREATE TABLE `agent_rig_bindings` (
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `image_id` TEXT NOT NULL REFERENCES `agent_images`(`id`) ON DELETE RESTRICT,
  `session_id` TEXT NOT NULL,
  `container_name` TEXT NOT NULL UNIQUE,
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
