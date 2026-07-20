# Packaging, installation, and removal

## Contents

1. Create the ZIP
2. Direct ZIP install
3. Direct HTTPS-link install
4. Chat approval install
5. Health and listing
6. Uninstall
7. Version changes

## Create the ZIP

From the parent of `my-plugin/`:

```sh
zip -r my-plugin.zip my-plugin \
  -x '*/node_modules/*' '*/.git/*' '*/.DS_Store'
```

Happy2 accepts either package files at the archive root or exactly one top-level directory containing `plugin.json`. Do not include symlinks, secrets, build caches, sockets, device nodes, or unrelated project files.

## Direct ZIP install

An authenticated server administrator posts multipart form data:

```sh
curl -X POST "$HAPPY2_URL/v0/admin/plugins/installPlugin" \
  -H "Authorization: Bearer $HAPPY2_TOKEN" \
  -F "archive=@my-plugin.zip;type=application/zip" \
  -F 'variables={}'
```

For declared variables, supply one JSON object. For a plugin without a bundled local image, also supply `containerImageId` as a multipart field.

## Direct HTTPS-link install

```sh
curl -X POST "$HAPPY2_URL/v0/admin/plugins/installPlugin" \
  -H "Authorization: Bearer $HAPPY2_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "sourceUrl": "https://downloads.example.com/my-plugin.zip",
    "variables": {}
  }'
```

Happy2 accepts public HTTPS on approved ports, rejects credentials/fragments/private destinations, revalidates redirects, pins DNS, caps the response at 20 MiB, validates the ZIP, and snapshots the exact package.

## Chat approval install

Use the `happy2_plugin_install_from_link` MCP tool when the user wants the agent to install a public linked package. Provide the URL and a concise reason. Happy2 downloads and validates first, then records the validated icon, name, description, source, digest, requesting plugin, agent, originating human, Rig call, and chat.

The tool returns after posting a pending request. It does not wait and does not install. A chat-member server administrator approves or denies the durable card. Approval installs the staged immutable bytes with a predetermined installation ID; denial leaves no running plugin.

Chat installation rejects packages needing variables or an administrator-selected image. Direct the user to the administrator form for those packages; never solicit secrets in chat.

## Health and listing

An accepted install returns HTTP 202 with an installation. Runtime work continues asynchronously through `preparing`, `starting`, and `ready`, or ends in `broken_configuration` or `failed` with bounded details.

Use the `happy2_plugins_list` tool from the developer plugin, or call:

```sh
curl "$HAPPY2_URL/v0/admin/systemPlugins" \
  -H "Authorization: Bearer $HAPPY2_TOKEN"
```

One durable system plugin may have multiple independent installations. Use installation IDs—not short names—when inspecting health or removing an instance.

## Uninstall

```sh
curl -X POST \
  "$HAPPY2_URL/v0/admin/pluginInstallations/INSTALLATION_ID/uninstallPlugin" \
  -H "Authorization: Bearer $HAPPY2_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{}'
```

Uninstall stops and removes that installation's runtime, encrypted variables, cached MCP tools, and durable installation. When it was the final installation, Happy2 also removes the system-plugin row and private package/image snapshot. Other installations remain intact.

## Version changes

Installed bytes are immutable. Reusing the same source installs another instance of the stored system package. A built-in catalog digest change is reported as `updateAvailable`; it does not silently mutate existing installations. If a different source tries to claim an installed short name, Happy2 rejects the collision. Publish intentional version changes as explicit package/update work, not by replacing bytes behind a stable URL and assuming they will be adopted.
