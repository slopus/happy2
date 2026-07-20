CREATE TABLE `document_write_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`chat_id` text NOT NULL,
	`actor_user_id` text,
	`agent_user_id` text,
	`requester_installation_id` text,
	`session_id` text NOT NULL,
	`call_id` text NOT NULL,
	`document_id` text NOT NULL,
	`document_title` text NOT NULL,
	`client_update_id` text NOT NULL,
	`updates_json` text NOT NULL,
	`accepted_sequence` text,
	`resolved_by_user_id` text,
	`resolved_at` text,
	`expires_at` text NOT NULL,
	`last_error` text,
	`sync_sequence` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requester_installation_id`) REFERENCES `plugin_installations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT `document_write_requests_status_check` CHECK (`status` in ('pending', 'approved', 'denied', 'failed')),
	CONSTRAINT `document_write_requests_updates_check` CHECK (json_valid(`updates_json`) and json_type(`updates_json`) = 'array')
);
--> statement-breakpoint
CREATE INDEX `document_write_requests_chat_index` ON `document_write_requests` (`chat_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `document_write_requests_pending_expiry_index` ON `document_write_requests` (`status`,`expires_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_write_requests_call_unique` ON `document_write_requests` (`requester_installation_id`,`call_id`);
