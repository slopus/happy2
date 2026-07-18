DROP TABLE `auth_magic_links`;
--> statement-breakpoint
CREATE TABLE `auth_magic_links` (
    `token_hash` TEXT PRIMARY KEY NOT NULL,
    `email` TEXT NOT NULL,
    `expires_at` TEXT NOT NULL,
    `consumed_at` TEXT,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `server_setup_state` (
    `id` INTEGER PRIMARY KEY NOT NULL CHECK (`id` = 1),
    `schema_version` INTEGER NOT NULL DEFAULT 1 CHECK (`schema_version` > 0),
    `bootstrap_account_id` TEXT REFERENCES `accounts`(`id`) ON DELETE RESTRICT,
    `bootstrap_admin_user_id` TEXT REFERENCES `users`(`id`) ON DELETE RESTRICT,
    `registration_enabled` INTEGER CHECK (`registration_enabled` IS NULL OR `registration_enabled` IN (0, 1)),
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (`bootstrap_admin_user_id` IS NULL OR `bootstrap_account_id` IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `server_setup_steps` (
    `step` TEXT PRIMARY KEY NOT NULL CHECK (`step` IN (
        'bootstrap_administrator',
        'sandbox_provider_selected',
        'sandbox_provider_validated',
        'base_image_selected',
        'base_image_build_requested',
        'base_image_ready',
        'default_agent_created',
        'registration_policy_selected',
        'server_setup_complete'
    )),
    `state` TEXT NOT NULL DEFAULT 'pending' CHECK (`state` IN ('pending', 'in_progress', 'complete', 'failed')),
    `metadata_json` TEXT,
    `last_error` TEXT,
    `started_at` TEXT,
    `completed_at` TEXT,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (`state` != 'complete' OR `completed_at` IS NOT NULL),
    CHECK (`state` != 'failed' OR `last_error` IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `user_onboarding_steps` (
    `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
    `step` TEXT NOT NULL CHECK (`step` IN ('avatar', 'desktop_notifications')),
    `state` TEXT NOT NULL DEFAULT 'pending' CHECK (`state` IN ('pending', 'complete', 'skipped')),
    `metadata_json` TEXT,
    `completed_at` TEXT,
    `created_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (`state` = 'pending' OR `completed_at` IS NOT NULL),
    PRIMARY KEY (`user_id`, `step`)
);
--> statement-breakpoint
INSERT INTO `server_setup_state` (`id`, `schema_version`)
VALUES (1, 1);
--> statement-breakpoint
INSERT INTO `server_setup_steps` (`step`, `state`)
VALUES
    ('bootstrap_administrator', 'pending'),
    ('sandbox_provider_selected', 'pending'),
    ('sandbox_provider_validated', 'pending'),
    ('base_image_selected', 'pending'),
    ('base_image_build_requested', 'pending'),
    ('base_image_ready', 'pending'),
    ('default_agent_created', 'pending'),
    ('registration_policy_selected', 'pending'),
    ('server_setup_complete', 'pending');
