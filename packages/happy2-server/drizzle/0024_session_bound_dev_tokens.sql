CREATE TABLE `auth_dev_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_dev_tokens_token_hash_unique` ON `auth_dev_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `auth_dev_tokens_session_id_index` ON `auth_dev_tokens` (`session_id`);
