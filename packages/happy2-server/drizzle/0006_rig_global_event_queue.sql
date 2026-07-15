CREATE TABLE `rig_event_sync_state` (
  `id` INTEGER PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `cursor` INTEGER,
  `trimmed_through` INTEGER,
  `events_since_trim` INTEGER NOT NULL DEFAULT 0,
  `last_trimmed_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT INTO `rig_event_sync_state` (`id`) VALUES (1);
