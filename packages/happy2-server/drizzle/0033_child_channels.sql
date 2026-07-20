ALTER TABLE `chats` ADD COLUMN `parent_chat_id` TEXT REFERENCES `chats`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `chats` ADD COLUMN `agent_model_id` TEXT;
--> statement-breakpoint
CREATE INDEX `chats_parent_chat_idx` ON `chats` (`parent_chat_id`, `deleted_at`);
--> statement-breakpoint
CREATE TABLE `__new_agent_rig_bindings` (
    `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
    `chat_id` TEXT NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
    `image_id` TEXT NOT NULL REFERENCES `agent_images`(`id`) ON DELETE RESTRICT,
    `session_id` TEXT NOT NULL,
    `container_name` TEXT NOT NULL,
    `cwd` TEXT NOT NULL,
    `effort` TEXT,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`user_id`, `chat_id`)
);
--> statement-breakpoint
INSERT INTO `__new_agent_rig_bindings` (
    `user_id`, `chat_id`, `image_id`, `session_id`, `container_name`, `cwd`, `effort`,
    `created_at`, `updated_at`
)
SELECT
    `user_id`, `chat_id`, `image_id`, `session_id`, `container_name`, `cwd`, `effort`,
    `created_at`, `updated_at`
FROM `agent_rig_bindings`;
--> statement-breakpoint
DROP TABLE `agent_rig_bindings`;
--> statement-breakpoint
ALTER TABLE `__new_agent_rig_bindings` RENAME TO `agent_rig_bindings`;
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_rig_bindings_session_unique_idx`
ON `agent_rig_bindings` (`session_id`);
--> statement-breakpoint
CREATE INDEX `agent_rig_bindings_chat_idx`
ON `agent_rig_bindings` (`chat_id`);
