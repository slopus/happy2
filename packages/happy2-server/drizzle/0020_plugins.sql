CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`short_name` text NOT NULL,
	`description` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_reference` text NOT NULL,
	`source_version` text NOT NULL,
	`package_digest` text NOT NULL,
	`manifest_json` text NOT NULL,
	`package_directory` text NOT NULL,
	`image_storage_key` text NOT NULL,
	`image_content_type` text NOT NULL,
	`image_size` integer NOT NULL,
	`image_width` integer NOT NULL,
	`image_height` integer NOT NULL,
	`image_thumbhash` text NOT NULL,
	`image_checksum_sha256` text NOT NULL,
	`installed_by_user_id` text,
	`sync_sequence` integer DEFAULT 0 NOT NULL,
	`installed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`installed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_short_name_unique` ON `plugins` (`short_name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_source_unique` ON `plugins` (`source_kind`,`source_reference`);
--> statement-breakpoint
CREATE TABLE `plugin_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`container_image_id` text,
	`runtime_image_tag` text,
	`container_name` text,
	`status` text DEFAULT 'preparing' NOT NULL,
	`status_detail` text,
	`last_error` text,
	`installed_by_user_id` text,
	`sync_sequence` integer DEFAULT 0 NOT NULL,
	`installed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ready_at` text,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`container_image_id`) REFERENCES `agent_images`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`installed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plugin_installations_plugin_id_index` ON `plugin_installations` (`plugin_id`);
--> statement-breakpoint
CREATE TABLE `plugin_installation_variables` (
	`installation_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`text_value` text,
	`secret_ciphertext` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`installation_id`, `key`),
	FOREIGN KEY (`installation_id`) REFERENCES `plugin_installations`(`id`) ON UPDATE no action ON DELETE cascade
);
