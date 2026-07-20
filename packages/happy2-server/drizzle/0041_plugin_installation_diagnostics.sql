ALTER TABLE `plugin_installations` ADD `diagnostic_output` text;
--> statement-breakpoint
ALTER TABLE `plugin_installations` ADD `source_version` text;
--> statement-breakpoint
ALTER TABLE `plugin_installations` ADD `package_digest` text;
--> statement-breakpoint
ALTER TABLE `plugin_installations` ADD `manifest_json` text;
--> statement-breakpoint
ALTER TABLE `plugin_installations` ADD `package_directory` text;
--> statement-breakpoint
UPDATE `plugin_installations`
SET (`source_version`, `package_digest`, `manifest_json`, `package_directory`) = (
    SELECT `source_version`, `package_digest`, `manifest_json`, `package_directory`
    FROM `plugins`
    WHERE `plugins`.`id` = `plugin_installations`.`plugin_id`
);
--> statement-breakpoint
CREATE TABLE `__new_plugin_installations` (
    `id` text PRIMARY KEY NOT NULL,
    `plugin_id` text NOT NULL,
    `container_image_id` text,
    `runtime_image_tag` text,
    `container_name` text,
    `container_instance_id` text,
    `granted_permissions_json` text DEFAULT '[]' NOT NULL,
    `status` text DEFAULT 'preparing' NOT NULL,
    `status_detail` text,
    `last_error` text,
    `diagnostic_output` text,
    `source_version` text NOT NULL,
    `package_digest` text NOT NULL,
    `manifest_json` text NOT NULL,
    `package_directory` text NOT NULL,
    `installed_by_user_id` text,
    `sync_sequence` integer DEFAULT 0 NOT NULL,
    `installed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `ready_at` text,
    `mcp_tools_synced_at` text,
    FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE restrict,
    FOREIGN KEY (`container_image_id`) REFERENCES `agent_images`(`id`) ON UPDATE no action ON DELETE restrict,
    FOREIGN KEY (`installed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_plugin_installations` (
    `id`,
    `plugin_id`,
    `container_image_id`,
    `runtime_image_tag`,
    `container_name`,
    `container_instance_id`,
    `granted_permissions_json`,
    `status`,
    `status_detail`,
    `last_error`,
    `diagnostic_output`,
    `source_version`,
    `package_digest`,
    `manifest_json`,
    `package_directory`,
    `installed_by_user_id`,
    `sync_sequence`,
    `installed_at`,
    `updated_at`,
    `ready_at`,
    `mcp_tools_synced_at`
)
SELECT
    `id`,
    `plugin_id`,
    `container_image_id`,
    `runtime_image_tag`,
    `container_name`,
    `container_instance_id`,
    `granted_permissions_json`,
    `status`,
    `status_detail`,
    `last_error`,
    `diagnostic_output`,
    `source_version`,
    `package_digest`,
    `manifest_json`,
    `package_directory`,
    `installed_by_user_id`,
    `sync_sequence`,
    `installed_at`,
    `updated_at`,
    `ready_at`,
    `mcp_tools_synced_at`
FROM `plugin_installations`;
--> statement-breakpoint
DROP TABLE `plugin_installations`;
--> statement-breakpoint
ALTER TABLE `__new_plugin_installations` RENAME TO `plugin_installations`;
--> statement-breakpoint
CREATE INDEX `plugin_installations_plugin_id_index` ON `plugin_installations` (`plugin_id`);
--> statement-breakpoint
CREATE TABLE `__new_plugin_skills` (
    `installation_id` text NOT NULL REFERENCES `plugin_installations`(`id`) ON DELETE CASCADE,
    `name` text NOT NULL,
    `description` text NOT NULL,
    `directory` text NOT NULL,
    PRIMARY KEY (`installation_id`, `name`)
);
--> statement-breakpoint
INSERT INTO `__new_plugin_skills` (`installation_id`, `name`, `description`, `directory`)
SELECT `plugin_installations`.`id`, `plugin_skills`.`name`, `plugin_skills`.`description`, `plugin_skills`.`directory`
FROM `plugin_skills`
INNER JOIN `plugin_installations` ON `plugin_installations`.`plugin_id` = `plugin_skills`.`plugin_id`;
--> statement-breakpoint
DROP TABLE `plugin_skills`;
--> statement-breakpoint
ALTER TABLE `__new_plugin_skills` RENAME TO `plugin_skills`;
--> statement-breakpoint
CREATE TABLE `__new_plugin_ui_assets` (
    `installation_id` text NOT NULL REFERENCES `plugin_installations`(`id`) ON DELETE CASCADE,
    `asset_id` text NOT NULL,
    `relative_path` text NOT NULL,
    `content_type` text NOT NULL,
    `byte_size` integer NOT NULL,
    `width` integer NOT NULL,
    `height` integer NOT NULL,
    `checksum_sha256` text NOT NULL,
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (`installation_id`, `asset_id`),
    CONSTRAINT `plugin_ui_assets_asset_id_check` CHECK(length(`asset_id`) between 1 and 64),
    CONSTRAINT `plugin_ui_assets_relative_path_check` CHECK(length(`relative_path`) between 1 and 512),
    CONSTRAINT `plugin_ui_assets_content_type_check` CHECK(`content_type` = 'image/png'),
    CONSTRAINT `plugin_ui_assets_byte_size_check` CHECK(`byte_size` between 1 and 65536),
    CONSTRAINT `plugin_ui_assets_dimensions_check` CHECK(`width` = 40 and `height` = 40),
    CONSTRAINT `plugin_ui_assets_checksum_check` CHECK(length(`checksum_sha256`) = 64 and `checksum_sha256` not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
INSERT INTO `__new_plugin_ui_assets` (`installation_id`, `asset_id`, `relative_path`, `content_type`, `byte_size`, `width`, `height`, `checksum_sha256`, `created_at`, `updated_at`)
SELECT `plugin_installations`.`id`, `plugin_ui_assets`.`asset_id`, `plugin_ui_assets`.`relative_path`, `plugin_ui_assets`.`content_type`, `plugin_ui_assets`.`byte_size`, `plugin_ui_assets`.`width`, `plugin_ui_assets`.`height`, `plugin_ui_assets`.`checksum_sha256`, `plugin_ui_assets`.`created_at`, `plugin_ui_assets`.`updated_at`
FROM `plugin_ui_assets`
INNER JOIN `plugin_installations` ON `plugin_installations`.`plugin_id` = `plugin_ui_assets`.`plugin_id`;
--> statement-breakpoint
DROP TABLE `plugin_ui_assets`;
--> statement-breakpoint
ALTER TABLE `__new_plugin_ui_assets` RENAME TO `plugin_ui_assets`;
--> statement-breakpoint
CREATE INDEX `plugin_ui_assets_checksum_index` ON `plugin_ui_assets` (`checksum_sha256`);
