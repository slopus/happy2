CREATE TABLE `port_shares` (
    `id` text PRIMARY KEY NOT NULL,
    `chat_id` text NOT NULL,
    `agent_user_id` text NOT NULL,
    `container_name` text NOT NULL,
    `container_port` integer NOT NULL CHECK (`container_port` BETWEEN 3000 AND 3010),
    `name` text NOT NULL,
    `subdomain` text NOT NULL,
    `created_by_user_id` text NOT NULL,
    `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    `disabled_at` text,
    `disabled_by_user_id` text,
    FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`agent_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`disabled_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `port_shares_subdomain_unique` ON `port_shares` (`subdomain`);
--> statement-breakpoint
CREATE UNIQUE INDEX `port_shares_active_chat_unique` ON `port_shares` (`chat_id`) WHERE `disabled_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `port_shares_chat_id_index` ON `port_shares` (`chat_id`);
