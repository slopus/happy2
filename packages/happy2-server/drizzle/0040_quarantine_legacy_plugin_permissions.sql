UPDATE `plugin_installations`
SET `status` = 'broken_configuration',
    `status_detail` = 'Installed plugin package must be reinstalled or updated.',
    `last_error` = 'Installed plugin uses the unsupported channels:manage permission.',
    `ready_at` = NULL,
    `updated_at` = CURRENT_TIMESTAMP
WHERE
    EXISTS (
        SELECT 1
        FROM json_each(`plugin_installations`.`granted_permissions_json`)
        WHERE `value` = 'channels:manage'
    )
    OR `plugin_id` IN (
        SELECT `plugins`.`id`
        FROM
            `plugins`,
            json_each(json_extract(`plugins`.`manifest_json`, '$.container.permissions'))
        WHERE json_each.`value` = 'channels:manage'
    );
