CREATE TABLE `document_file_attachments` (
	`document_id` text NOT NULL,
	`file_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`attached_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`document_id`, `file_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`attached_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_file_attachments_position_idx` ON `document_file_attachments` (`document_id`,`position`);
--> statement-breakpoint
CREATE INDEX `document_file_attachments_file_id_idx` ON `document_file_attachments` (`file_id`);
--> statement-breakpoint
CREATE INDEX `document_file_attachments_attached_by_user_id_idx` ON `document_file_attachments` (`attached_by_user_id`);