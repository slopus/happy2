CREATE TABLE `plugin_function_results` (
	`session_id` text NOT NULL,
	`call_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`lease_token` text,
	`locked_until` text,
	`resolution_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`session_id`, `call_id`)
);
