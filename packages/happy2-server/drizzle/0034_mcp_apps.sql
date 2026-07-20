ALTER TABLE `plugin_mcp_tools` ADD COLUMN `meta_json` TEXT;
--> statement-breakpoint
CREATE TABLE `plugin_mcp_app_calls` (
    `session_id` TEXT NOT NULL,
    `call_id` TEXT NOT NULL,
    `user_message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
    `agent_user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
    `installation_id` TEXT NOT NULL REFERENCES `plugin_installations`(`id`) ON DELETE CASCADE,
    `tool_name` TEXT NOT NULL,
    `resource_uri` TEXT NOT NULL,
    `arguments_json` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'in_progress',
    `result_json` TEXT,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`session_id`, `call_id`)
);
--> statement-breakpoint
CREATE INDEX `plugin_mcp_app_calls_turn_index`
ON `plugin_mcp_app_calls` (`user_message_id`, `agent_user_id`);
--> statement-breakpoint
CREATE INDEX `plugin_mcp_app_calls_installation_index`
ON `plugin_mcp_app_calls` (`installation_id`);
--> statement-breakpoint
CREATE TABLE `plugin_mcp_app_resources` (
    `installation_id` TEXT NOT NULL REFERENCES `plugin_installations`(`id`) ON DELETE CASCADE,
    `uri` TEXT NOT NULL,
    `html` TEXT NOT NULL,
    `content_hash_sha256` TEXT NOT NULL,
    `csp_json` TEXT,
    `permissions_json` TEXT,
    `domain` TEXT,
    `prefers_border` INTEGER,
    `synced_at` TEXT NOT NULL,
    PRIMARY KEY (`installation_id`, `uri`)
);
