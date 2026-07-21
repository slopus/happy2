ALTER TABLE `port_shares`
ADD `audience` text DEFAULT 'chat' NOT NULL
CONSTRAINT `port_shares_audience_check`
CHECK (`audience` IN ('internet', 'server', 'chat'));
