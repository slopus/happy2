ALTER TABLE `agent_turns` ADD `trace_latest_kind` text;
--> statement-breakpoint
ALTER TABLE `agent_turns` ADD `trace_latest_title` text;
--> statement-breakpoint
ALTER TABLE `agent_turns` ADD `trace_latest_detail` text;
--> statement-breakpoint
ALTER TABLE `agent_turns` ADD `trace_latest_at` integer;
--> statement-breakpoint
ALTER TABLE `agent_turns` ADD `trace_entry_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_turns` ADD `trace_subagents_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `agent_turns` ADD `trace_background_terminals_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `agent_turn_trace_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_message_id` text NOT NULL,
	`agent_user_id` text NOT NULL,
	`trace_key` text NOT NULL,
	`session_event_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text,
	`status` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`completed_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_turn_trace_entries_turn_key_unique` ON `agent_turn_trace_entries` (`user_message_id`,`agent_user_id`,`trace_key`);
--> statement-breakpoint
CREATE INDEX `agent_turn_trace_entries_turn_time_index` ON `agent_turn_trace_entries` (`user_message_id`,`agent_user_id`,`occurred_at`);
