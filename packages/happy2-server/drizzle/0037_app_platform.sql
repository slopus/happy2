CREATE TABLE `plugin_ui_assets` (
	`plugin_id` text NOT NULL,
	`asset_id` text NOT NULL CHECK (length(`asset_id`) BETWEEN 1 AND 64),
	`relative_path` text NOT NULL CHECK (length(`relative_path`) BETWEEN 1 AND 512),
	`content_type` text NOT NULL CHECK (`content_type` = 'image/png'),
	`byte_size` integer NOT NULL CHECK (`byte_size` BETWEEN 1 AND 65536),
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`checksum_sha256` text NOT NULL CHECK (length(`checksum_sha256`) = 64 AND `checksum_sha256` NOT GLOB '*[^0-9a-f]*'),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`plugin_id`, `asset_id`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	CHECK (`width` = 40 AND `height` = 40)
);
--> statement-breakpoint
CREATE INDEX `plugin_ui_assets_checksum_index` ON `plugin_ui_assets` (`checksum_sha256`);
--> statement-breakpoint
CREATE TABLE `plugin_app_instances` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`instance_key` text NOT NULL CHECK (length(`instance_key`) BETWEEN 1 AND 128),
	`resource_uri` text NOT NULL CHECK (length(`resource_uri`) BETWEEN 6 AND 2048 AND substr(`resource_uri`, 1, 5) = 'ui://'),
	`resource_html` text NOT NULL,
	`resource_content_hash_sha256` text NOT NULL CHECK (length(`resource_content_hash_sha256`) = 64 AND `resource_content_hash_sha256` NOT GLOB '*[^0-9a-f]*'),
	`resource_csp_json` text CHECK (`resource_csp_json` IS NULL OR (json_valid(`resource_csp_json`) AND json_type(`resource_csp_json`) = 'object')),
	`resource_permissions_json` text CHECK (`resource_permissions_json` IS NULL OR (json_valid(`resource_permissions_json`) AND json_type(`resource_permissions_json`) = 'object')),
	`resource_domain` text,
	`resource_prefers_border` integer CHECK (`resource_prefers_border` IS NULL OR `resource_prefers_border` IN (0, 1)),
	`title` text NOT NULL CHECK (length(trim(`title`)) BETWEEN 1 AND 64),
	`description` text NOT NULL CHECK (length(trim(`description`)) BETWEEN 1 AND 256),
	`asset_id` text NOT NULL CHECK (length(`asset_id`) BETWEEN 1 AND 64),
	`context_json` text DEFAULT '{}' NOT NULL CHECK (length(`context_json`) <= 32768 AND CASE WHEN json_valid(`context_json`) THEN json_type(`context_json`) = 'object' ELSE 0 END),
	`data_revision` integer DEFAULT 0 NOT NULL CHECK (`data_revision` >= 0),
	`scope` text NOT NULL CHECK (`scope` IN ('all_users', 'user')),
	`owner_user_id` text,
	`chat_id` text,
	`presentation` text DEFAULT 'sidebar' NOT NULL CHECK (`presentation` IN ('sidebar', 'detached')),
	`position` text NOT NULL CHECK (length(`position`) BETWEEN 1 AND 256),
	`revision` integer DEFAULT 0 NOT NULL CHECK (`revision` >= 0),
	`created_by_user_id` text,
	`sync_sequence` integer DEFAULT 0 NOT NULL CHECK (`sync_sequence` >= 0),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `plugin_installations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CHECK ((`scope` = 'all_users' AND `owner_user_id` IS NULL) OR (`scope` = 'user' AND `owner_user_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_app_instances_installation_key_unique` ON `plugin_app_instances` (`installation_id`,`instance_key`);
--> statement-breakpoint
CREATE INDEX `plugin_app_instances_resource_index` ON `plugin_app_instances` (`installation_id`,`resource_uri`);
--> statement-breakpoint
CREATE INDEX `plugin_app_instances_owner_index` ON `plugin_app_instances` (`owner_user_id`,`presentation`,`position`);
--> statement-breakpoint
CREATE INDEX `plugin_app_instances_chat_index` ON `plugin_app_instances` (`chat_id`,`presentation`,`position`);
--> statement-breakpoint
CREATE INDEX `plugin_app_instances_listing_index` ON `plugin_app_instances` (`scope`,`presentation`,`position`);
--> statement-breakpoint
CREATE TABLE `plugin_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`contribution_key` text NOT NULL CHECK (length(`contribution_key`) BETWEEN 1 AND 128),
	`placement` text NOT NULL CHECK (`placement` IN ('sidebarMenu', 'profileSection', 'pluginSettings', 'chatMenu', 'composerIcon', 'composerMenu', 'messageMenu')),
	`title` text NOT NULL CHECK (length(trim(`title`)) BETWEEN 1 AND 64),
	`description` text NOT NULL CHECK (length(trim(`description`)) BETWEEN 1 AND 256),
	`spec_json` text NOT NULL CHECK (length(`spec_json`) BETWEEN 2 AND 32768 AND CASE WHEN json_valid(`spec_json`) THEN json_type(`spec_json`) = 'object' ELSE 0 END),
	`scope` text NOT NULL CHECK (`scope` IN ('all_users', 'user')),
	`owner_user_id` text,
	`chat_id` text,
	`position` text NOT NULL CHECK (length(`position`) BETWEEN 1 AND 256),
	`revision` integer DEFAULT 0 NOT NULL CHECK (`revision` >= 0),
	`sync_sequence` integer DEFAULT 0 NOT NULL CHECK (`sync_sequence` >= 0),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`installation_id`) REFERENCES `plugin_installations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CHECK ((`scope` = 'all_users' AND `owner_user_id` IS NULL) OR (`scope` = 'user' AND `owner_user_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_contributions_installation_key_unique` ON `plugin_contributions` (`installation_id`,`contribution_key`);
--> statement-breakpoint
CREATE INDEX `plugin_contributions_placement_index` ON `plugin_contributions` (`placement`,`position`);
--> statement-breakpoint
CREATE INDEX `plugin_contributions_owner_index` ON `plugin_contributions` (`owner_user_id`,`placement`,`position`);
--> statement-breakpoint
CREATE INDEX `plugin_contributions_chat_index` ON `plugin_contributions` (`chat_id`,`placement`,`position`);
--> statement-breakpoint
CREATE TABLE `app_presentation_preferences` (
	`user_id` text NOT NULL,
	`instance_id` text NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL CHECK (`hidden` IN (0, 1)),
	`position` text CHECK (`position` IS NULL OR length(`position`) BETWEEN 1 AND 256),
	`sync_sequence` integer DEFAULT 0 NOT NULL CHECK (`sync_sequence` >= 0),
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `instance_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`instance_id`) REFERENCES `plugin_app_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_presentation_preferences_instance_index` ON `app_presentation_preferences` (`instance_id`);
--> statement-breakpoint
CREATE INDEX `app_presentation_preferences_user_listing_index` ON `app_presentation_preferences` (`user_id`,`hidden`,`position`);
