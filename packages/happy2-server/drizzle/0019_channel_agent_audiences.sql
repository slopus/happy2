ALTER TABLE `messages` ADD COLUMN `audience` TEXT NOT NULL DEFAULT 'people' CHECK (`audience` IN ('people', 'agents'));
--> statement-breakpoint
CREATE TABLE `message_agent_audiences` (
    `message_id` TEXT NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
    `agent_user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`message_id`, `agent_user_id`)
);
--> statement-breakpoint
CREATE INDEX `message_agent_audiences_agent_message_idx`
ON `message_agent_audiences` (`agent_user_id`, `message_id`);
--> statement-breakpoint
ALTER TABLE `agent_turns` ADD COLUMN `prompt` TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `agent_turns`
SET `prompt` = coalesce((SELECT `text` FROM `messages` WHERE `messages`.`id` = `agent_turns`.`user_message_id`), '');
