ALTER TABLE `agent_rig_bindings` ADD COLUMN `effort` TEXT;
--> statement-breakpoint
UPDATE `agent_rig_bindings`
SET `effort` = (
    SELECT `users`.`agent_effort`
    FROM `users`
    WHERE `users`.`id` = `agent_rig_bindings`.`user_id`
)
WHERE `effort` IS NULL;
