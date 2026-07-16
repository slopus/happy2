CREATE TABLE `agent_secret_agent_assignments` (
  `secret_id` TEXT NOT NULL,
  `agent_user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`secret_id`, `agent_user_id`)
);
--> statement-breakpoint
CREATE INDEX `agent_secret_agent_assignments_agent_idx`
ON `agent_secret_agent_assignments` (`agent_user_id`, `secret_id`);
--> statement-breakpoint
CREATE TABLE `agent_secret_channel_assignments` (
  `secret_id` TEXT NOT NULL,
  `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
  `created_by_user_id` TEXT REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`secret_id`, `chat_id`)
);
--> statement-breakpoint
CREATE INDEX `agent_secret_channel_assignments_chat_idx`
ON `agent_secret_channel_assignments` (`chat_id`, `secret_id`);
