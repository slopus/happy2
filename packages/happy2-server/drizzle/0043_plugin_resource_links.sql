CREATE TABLE `plugin_resource_links` (
    `session_id` TEXT NOT NULL,
    `call_id` TEXT NOT NULL,
    `position` INTEGER NOT NULL,
    `user_message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
    `agent_user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
    `installation_id` TEXT NOT NULL REFERENCES `plugin_installations`(`id`) ON DELETE CASCADE,
    `tool_name` TEXT NOT NULL,
    `kind` TEXT NOT NULL,
    `uri` TEXT NOT NULL,
    `name` TEXT NOT NULL,
    `title` TEXT,
    `description` TEXT,
    `mime_type` TEXT,
    `size` INTEGER,
    PRIMARY KEY (`session_id`, `call_id`, `position`),
    CONSTRAINT `plugin_resource_links_position_check` CHECK (`position` >= 0),
    CONSTRAINT `plugin_resource_links_kind_check` CHECK (`kind` IN ('resource', 'shared_link')),
    CONSTRAINT `plugin_resource_links_size_check` CHECK (`size` IS NULL OR `size` >= 0)
);
--> statement-breakpoint
CREATE INDEX `plugin_resource_links_turn_index`
ON `plugin_resource_links` (`user_message_id`, `agent_user_id`);
--> statement-breakpoint
CREATE INDEX `plugin_resource_links_installation_index`
ON `plugin_resource_links` (`installation_id`);
