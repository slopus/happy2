import { describe, expect, it } from "vitest";
import { parseConfig } from "./loader.js";

const base = `[server]
role = "all"
host = "127.0.0.1"
port = 3000
public_url = "https://rigged.example"

[database]
url = "file:/tmp/rigged.db"

[jwt]
issuer = "https://rigged.example"
audience = "rigged"
key_id = "test"
`;

describe("TOML config", () => {
    it("loads one selected authentication mechanism", () => {
        const config = parseConfig(`${base}
[auth.oidc.example]
enabled = true
discovery_url = "https://id.example/.well-known/openid-configuration"
client_id = "client"
client_secret_env = "OIDC_SECRET"
redirect_path = "/v0/auth/oidc/example/callback"
`);
        expect(config.auth.password.enabled).toBe(false);
        expect(config.auth.oidc.get("example")?.clientSecretEnv).toBe("OIDC_SECRET");
    });

    it("rejects more than one enabled authentication mechanism", () => {
        expect(() =>
            parseConfig(`${base}
[auth.password]
enabled = true

[auth.magic_link]
enabled = true
redirect_url = "rigged://auth/magic-link"
`),
        ).toThrow("only one authentication method");
    });

    it("requires a desktop callback when magic links are enabled", () => {
        expect(() =>
            parseConfig(`${base}
[auth.magic_link]
enabled = true
`),
        ).toThrow("redirect_url");
    });

    it("loads file pipeline limits and scanner policy", () => {
        const config = parseConfig(`${base}
[files]
provider = "local"
resumable_chunk_bytes = 1048576
per_user_quota_bytes = 5368709120
server_quota_bytes = 107374182400
malware_scanner_command = "/usr/bin/scanner"
malware_scanner_arguments = ["--quiet", "{path}"]
malware_scan_failure_mode = "allow"
`);
        expect(config.files).toMatchObject({
            provider: "local",
            resumableChunkBytes: 1048576,
            perUserQuotaBytes: 5368709120,
            serverQuotaBytes: 107374182400,
            malwareScannerCommand: "/usr/bin/scanner",
            malwareScannerArguments: ["--quiet", "{path}"],
            malwareScanFailureMode: "allow",
        });
    });

    it("rejects unsafe file pipeline limits", () => {
        expect(() =>
            parseConfig(`${base}
[files]
resumable_chunk_bytes = 1
`),
        ).toThrow("resumable_chunk_bytes");
    });
});
