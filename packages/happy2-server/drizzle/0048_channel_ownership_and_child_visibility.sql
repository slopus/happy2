UPDATE `chat_members`
SET
    `left_at` = CURRENT_TIMESTAMP,
    `removed_by_user_id` = NULL,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `left_at` IS NULL
  AND EXISTS (
      SELECT 1
      FROM `chats` AS `child`
      WHERE `child`.`id` = `chat_members`.`chat_id`
        AND `child`.`parent_chat_id` IS NOT NULL
  )
  AND NOT EXISTS (
      SELECT 1
      FROM `chats` AS `child`
      JOIN `chat_members` AS `parent_member`
        ON `parent_member`.`chat_id` = `child`.`parent_chat_id`
       AND `parent_member`.`user_id` = `chat_members`.`user_id`
       AND `parent_member`.`left_at` IS NULL
      WHERE `child`.`id` = `chat_members`.`chat_id`
  );
--> statement-breakpoint
UPDATE `chats` AS `child`
SET
    `kind` = (
        SELECT `parent`.`kind`
        FROM `chats` AS `parent`
        WHERE `parent`.`id` = `child`.`parent_chat_id`
    ),
    `visibility` = (
        SELECT `parent`.`visibility`
        FROM `chats` AS `parent`
        WHERE `parent`.`id` = `child`.`parent_chat_id`
    )
WHERE `child`.`parent_chat_id` IS NOT NULL;
--> statement-breakpoint
UPDATE `chats` AS `child`
SET `owner_user_id` = COALESCE(
    (
        SELECT `member`.`user_id`
        FROM `chat_members` AS `member`
        JOIN `users` AS `candidate` ON `candidate`.`id` = `member`.`user_id`
        JOIN `chat_members` AS `parent_member`
          ON `parent_member`.`chat_id` = `child`.`parent_chat_id`
         AND `parent_member`.`user_id` = `member`.`user_id`
         AND `parent_member`.`left_at` IS NULL
        WHERE `member`.`chat_id` = `child`.`id`
          AND `member`.`user_id` = `child`.`owner_user_id`
          AND `member`.`left_at` IS NULL
          AND `candidate`.`deleted_at` IS NULL
          AND `candidate`.`agent_role` IS NULL
        LIMIT 1
    ),
    (
        SELECT `member`.`user_id`
        FROM `chat_members` AS `member`
        JOIN `users` AS `candidate` ON `candidate`.`id` = `member`.`user_id`
        JOIN `chat_members` AS `parent_member`
          ON `parent_member`.`chat_id` = `child`.`parent_chat_id`
         AND `parent_member`.`user_id` = `member`.`user_id`
         AND `parent_member`.`left_at` IS NULL
        WHERE `member`.`chat_id` = `child`.`id`
          AND `member`.`user_id` = `child`.`created_by_user_id`
          AND `member`.`left_at` IS NULL
          AND `candidate`.`deleted_at` IS NULL
          AND `candidate`.`agent_role` IS NULL
        LIMIT 1
    ),
    (
        SELECT `member`.`user_id`
        FROM `chat_members` AS `member`
        JOIN `users` AS `candidate` ON `candidate`.`id` = `member`.`user_id`
        JOIN `chat_members` AS `parent_member`
          ON `parent_member`.`chat_id` = `child`.`parent_chat_id`
         AND `parent_member`.`user_id` = `member`.`user_id`
         AND `parent_member`.`left_at` IS NULL
        WHERE `member`.`chat_id` = `child`.`id`
          AND `member`.`role` = 'admin'
          AND `member`.`left_at` IS NULL
          AND `candidate`.`deleted_at` IS NULL
          AND `candidate`.`agent_role` IS NULL
        ORDER BY `member`.`joined_at`, `member`.`user_id`
        LIMIT 1
    ),
    (
        SELECT `member`.`user_id`
        FROM `chat_members` AS `member`
        JOIN `users` AS `candidate` ON `candidate`.`id` = `member`.`user_id`
        JOIN `chat_members` AS `parent_member`
          ON `parent_member`.`chat_id` = `child`.`parent_chat_id`
         AND `parent_member`.`user_id` = `member`.`user_id`
         AND `parent_member`.`left_at` IS NULL
        WHERE `member`.`chat_id` = `child`.`id`
          AND `member`.`left_at` IS NULL
          AND `candidate`.`deleted_at` IS NULL
          AND `candidate`.`agent_role` IS NULL
        ORDER BY `member`.`joined_at`, `member`.`user_id`
        LIMIT 1
    ),
    (
        SELECT `parent`.`owner_user_id`
        FROM `chats` AS `parent`
        JOIN `chat_members` AS `parent_owner`
          ON `parent_owner`.`chat_id` = `parent`.`id`
         AND `parent_owner`.`user_id` = `parent`.`owner_user_id`
         AND `parent_owner`.`left_at` IS NULL
        JOIN `users` AS `candidate` ON `candidate`.`id` = `parent_owner`.`user_id`
        WHERE `parent`.`id` = `child`.`parent_chat_id`
          AND `candidate`.`deleted_at` IS NULL
          AND `candidate`.`agent_role` IS NULL
        LIMIT 1
    )
)
WHERE `child`.`parent_chat_id` IS NOT NULL
  AND `child`.`kind` = 'private_channel';
--> statement-breakpoint
UPDATE `chat_members`
SET `role` = 'admin', `updated_at` = CURRENT_TIMESTAMP
WHERE `role` = 'owner'
  AND EXISTS (
      SELECT 1
      FROM `chats`
      WHERE `chats`.`id` = `chat_members`.`chat_id`
        AND (
            `chats`.`kind` = 'public_channel'
            OR (
                `chats`.`parent_chat_id` IS NOT NULL
                AND `chats`.`kind` = 'private_channel'
                AND `chats`.`owner_user_id` IS NOT `chat_members`.`user_id`
            )
        )
  );
--> statement-breakpoint
UPDATE `chats`
SET `owner_user_id` = NULL, `updated_at` = CURRENT_TIMESTAMP
WHERE `kind` = 'public_channel';
--> statement-breakpoint
INSERT INTO `chat_members` (
    `chat_id`,
    `user_id`,
    `role`,
    `membership_epoch`,
    `sync_sequence`
)
SELECT
    `child`.`id`,
    `child`.`owner_user_id`,
    'owner',
    lower(hex(randomblob(16))),
    `child`.`last_change_sequence`
FROM `chats` AS `child`
WHERE `child`.`parent_chat_id` IS NOT NULL
  AND `child`.`kind` = 'private_channel'
  AND `child`.`owner_user_id` IS NOT NULL
ON CONFLICT (`chat_id`, `user_id`) DO UPDATE SET
    `role` = 'owner',
    `membership_epoch` = CASE
        WHEN `chat_members`.`left_at` IS NULL THEN `chat_members`.`membership_epoch`
        ELSE excluded.`membership_epoch`
    END,
    `joined_at` = CASE
        WHEN `chat_members`.`left_at` IS NULL THEN `chat_members`.`joined_at`
        ELSE CURRENT_TIMESTAMP
    END,
    `left_at` = NULL,
    `removed_by_user_id` = NULL,
    `sync_sequence` = excluded.`sync_sequence`,
    `updated_at` = CURRENT_TIMESTAMP;
