ALTER TABLE `messages`
ADD `automated` integer DEFAULT 0 NOT NULL
CONSTRAINT `messages_automated_check`
CHECK (`automated` IN (0, 1));
