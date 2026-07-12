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
});
