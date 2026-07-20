CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'blocknote' NOT NULL,
	`created_by_user_id` text,
	`snapshot_update` text NOT NULL,
	`snapshot_sequence` integer DEFAULT 0 NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_chat_id_idx` ON `documents` (`chat_id`);
--> statement-breakpoint
CREATE TABLE `document_updates` (
	`document_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`update` text NOT NULL,
	`client_update_id` text NOT NULL,
	`actor_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`document_id`, `sequence`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_updates_client_update_idx` ON `document_updates` (`document_id`,`client_update_id`);
