CREATE TABLE `__new_role_permissions` (
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`role_id`, `permission`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	CHECK (`permission` IN ('manageSecrets', 'assignSecrets', 'manageImages', 'assignImagesToChats', 'managePlugins', 'viewAllMembers', 'manageAdminRoles', 'resetPasswords'))
);
--> statement-breakpoint
INSERT INTO `__new_role_permissions` (`role_id`, `permission`, `created_at`)
SELECT `role_id`, `permission`, `created_at` FROM `role_permissions`;
--> statement-breakpoint
DROP TABLE `role_permissions`;
--> statement-breakpoint
ALTER TABLE `__new_role_permissions` RENAME TO `role_permissions`;
--> statement-breakpoint
CREATE TABLE `__new_user_permissions` (
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`granted_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `permission`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CHECK (`permission` IN ('manageSecrets', 'assignSecrets', 'manageImages', 'assignImagesToChats', 'managePlugins', 'viewAllMembers', 'manageAdminRoles', 'resetPasswords'))
);
--> statement-breakpoint
INSERT INTO `__new_user_permissions` (`user_id`, `permission`, `granted_by_user_id`, `created_at`)
SELECT `user_id`, `permission`, `granted_by_user_id`, `created_at` FROM `user_permissions`;
--> statement-breakpoint
DROP TABLE `user_permissions`;
--> statement-breakpoint
ALTER TABLE `__new_user_permissions` RENAME TO `user_permissions`;
