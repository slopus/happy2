CREATE TABLE `plugin_management_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`chat_id` text NOT NULL,
	`actor_user_id` text,
	`agent_user_id` text,
	`requester_installation_id` text,
	`call_id` text NOT NULL,
	`display_name` text NOT NULL,
	`short_name` text NOT NULL,
	`description` text NOT NULL,
	`reason` text,
	`source_kind` text,
	`source_reference` text,
	`package_digest` text,
	`package_directory` text,
	`target_installation_id` text,
	`installation_id` text,
	`resolved_by_user_id` text,
	`resolved_at` text,
	`last_error` text,
	`sync_sequence` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requester_installation_id`) REFERENCES `plugin_installations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plugin_management_requests_chat_index` ON `plugin_management_requests` (`chat_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_management_requests_call_unique` ON `plugin_management_requests` (`requester_installation_id`,`call_id`,`action`);
