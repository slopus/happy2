CREATE TABLE `plugin_skills` (
	`plugin_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`directory` text NOT NULL,
	PRIMARY KEY(`plugin_id`, `name`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
