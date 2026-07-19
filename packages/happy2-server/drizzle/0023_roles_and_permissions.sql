CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL COLLATE NOCASE,
	`description` text,
	`builtin_kind` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CHECK (`builtin_kind` IS NULL OR `builtin_kind` IN ('admin', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_name_unique` ON `roles` (`name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_builtin_kind_unique` ON `roles` (`builtin_kind`) WHERE `builtin_kind` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` text NOT NULL,
	`permission` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`role_id`, `permission`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	CHECK (`permission` IN ('manageSecrets', 'assignSecrets', 'manageImages', 'assignImagesToChats', 'managePlugins', 'viewAllMembers', 'manageAdminRoles'))
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`assigned_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `user_roles_role_id_index` ON `user_roles` (`role_id`);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`granted_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `permission`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CHECK (`permission` IN ('manageSecrets', 'assignSecrets', 'manageImages', 'assignImagesToChats', 'managePlugins', 'viewAllMembers', 'manageAdminRoles'))
);
--> statement-breakpoint
INSERT INTO `roles` (`id`, `name`, `description`, `builtin_kind`)
VALUES
	('happy2_builtin_admins', 'Admins', 'Server administrators', 'admin'),
	('happy2_builtin_members', 'Members', 'All server members', 'member');
--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission`)
VALUES
	('happy2_builtin_admins', 'manageSecrets'),
	('happy2_builtin_admins', 'assignSecrets'),
	('happy2_builtin_admins', 'manageImages'),
	('happy2_builtin_admins', 'assignImagesToChats'),
	('happy2_builtin_admins', 'managePlugins'),
	('happy2_builtin_admins', 'viewAllMembers');
--> statement-breakpoint
INSERT INTO `user_roles` (`user_id`, `role_id`)
SELECT `id`, 'happy2_builtin_members' FROM `users` WHERE `kind` = 'human' AND `deleted_at` IS NULL;
--> statement-breakpoint
INSERT INTO `user_roles` (`user_id`, `role_id`)
SELECT `id`, 'happy2_builtin_admins' FROM `users` WHERE `kind` = 'human' AND `role` = 'admin' AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE TRIGGER `roles_prevent_builtin_delete`
BEFORE DELETE ON `roles`
WHEN OLD.`builtin_kind` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'built-in roles cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER `roles_prevent_builtin_kind_change`
BEFORE UPDATE OF `builtin_kind` ON `roles`
WHEN OLD.`builtin_kind` IS NOT NEW.`builtin_kind`
BEGIN
	SELECT RAISE(ABORT, 'built-in role markers cannot be changed');
END;
