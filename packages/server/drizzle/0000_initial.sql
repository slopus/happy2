CREATE TABLE `users` (`id` TEXT PRIMARY KEY NOT NULL, `email` TEXT NOT NULL UNIQUE, `password_hash` TEXT, `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE `oidc_identities` (`provider` TEXT NOT NULL, `subject` TEXT NOT NULL, `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE, `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`provider`, `subject`));
--> statement-breakpoint
CREATE TABLE `auth_sessions` (`id` TEXT PRIMARY KEY NOT NULL, `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE, `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, `expires_at` TEXT NOT NULL, `last_seen_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, `revoked_at` TEXT);
--> statement-breakpoint
CREATE INDEX `auth_sessions_active_user_idx` ON `auth_sessions` (`user_id`, `expires_at`);
--> statement-breakpoint
CREATE TABLE `auth_session_events` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `session_id` TEXT NOT NULL REFERENCES `auth_sessions`(`id`) ON DELETE CASCADE, `event_type` TEXT NOT NULL, `ip` TEXT, `forwarded_for` TEXT, `location` TEXT, `device` TEXT, `app_version` TEXT, `user_agent` TEXT, `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE `auth_magic_links` (`token_hash` TEXT PRIMARY KEY NOT NULL, `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE, `expires_at` TEXT NOT NULL, `consumed_at` TEXT, `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
--> statement-breakpoint
CREATE TABLE `auth_oidc_states` (`state` TEXT PRIMARY KEY NOT NULL, `provider` TEXT NOT NULL, `code_verifier` TEXT NOT NULL, `nonce` TEXT NOT NULL, `redirect_uri` TEXT NOT NULL, `expires_at` TEXT NOT NULL, `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
