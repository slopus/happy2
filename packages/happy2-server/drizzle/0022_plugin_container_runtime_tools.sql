ALTER TABLE `plugin_installations` ADD `mcp_tools_synced_at` text;
--> statement-breakpoint
ALTER TABLE `plugin_installations` ADD `container_instance_id` text;
--> statement-breakpoint
CREATE TABLE `plugin_mcp_tools` (
	`installation_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`description` text,
	`input_schema_json` text NOT NULL,
	`output_schema_json` text,
	`annotations_json` text,
	`synced_at` text NOT NULL,
	PRIMARY KEY(`installation_id`, `name`),
	FOREIGN KEY (`installation_id`) REFERENCES `plugin_installations`(`id`) ON UPDATE no action ON DELETE cascade
);
