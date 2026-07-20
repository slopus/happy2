CREATE TABLE `__new_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`format` text DEFAULT 'blocknote' NOT NULL,
	`snapshot_update` text NOT NULL,
	`snapshot_sequence` integer DEFAULT 0 NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_documents` (
	`id`,
	`owner_user_id`,
	`title`,
	`format`,
	`snapshot_update`,
	`snapshot_sequence`,
	`last_sequence`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`created_by_user_id`,
	`title`,
	`format`,
	`snapshot_update`,
	`snapshot_sequence`,
	`last_sequence`,
	`created_at`,
	`updated_at`
FROM `documents`;
--> statement-breakpoint
CREATE TABLE `__document_updates_backup` (
	`document_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`update` text NOT NULL,
	`client_update_id` text NOT NULL,
	`actor_user_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__document_updates_backup`
SELECT
	`document_id`,
	`sequence`,
	`update`,
	`client_update_id`,
	`actor_user_id`,
	`created_at`
FROM `document_updates`;
--> statement-breakpoint
CREATE TABLE `__document_channel_attachments_backup` (
	`document_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`attached_by_user_id` text NOT NULL,
	`attached_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__document_channel_attachments_backup`
SELECT
	`id`,
	`chat_id`,
	`created_by_user_id`,
	`created_at`
FROM `documents`;
--> statement-breakpoint
DROP TABLE `document_updates`;
--> statement-breakpoint
DROP TABLE `documents`;
--> statement-breakpoint
ALTER TABLE `__new_documents` RENAME TO `documents`;
--> statement-breakpoint
CREATE INDEX `documents_owner_user_id_idx` ON `documents` (`owner_user_id`);
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
INSERT INTO `document_updates`
SELECT
	`document_id`,
	`sequence`,
	`update`,
	`client_update_id`,
	`actor_user_id`,
	`created_at`
FROM `__document_updates_backup`;
--> statement-breakpoint
DROP TABLE `__document_updates_backup`;
--> statement-breakpoint
CREATE UNIQUE INDEX `document_updates_client_update_idx` ON `document_updates` (`document_id`,`client_update_id`);
--> statement-breakpoint
CREATE TABLE `document_channel_attachments` (
	`document_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`attached_by_user_id` text NOT NULL,
	`attached_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`document_id`, `chat_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attached_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `document_channel_attachments`
SELECT
	`document_id`,
	`chat_id`,
	`attached_by_user_id`,
	`attached_at`
FROM `__document_channel_attachments_backup`;
--> statement-breakpoint
DROP TABLE `__document_channel_attachments_backup`;
--> statement-breakpoint
CREATE INDEX `document_channel_attachments_chat_id_idx` ON `document_channel_attachments` (`chat_id`);
--> statement-breakpoint
CREATE INDEX `document_channel_attachments_attached_by_user_id_idx` ON `document_channel_attachments` (`attached_by_user_id`);
