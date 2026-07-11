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
    it("keeps mechanisms independently configurable", () => {
        const config = parseConfig(`${base}
[auth.password]
enabled = true
signup_enabled = false

[auth.oidc.example]
enabled = true
discovery_url = "https://id.example/.well-known/openid-configuration"
client_id = "client"
client_secret_env = "OIDC_SECRET"
redirect_path = "/v0/auth/oidc/example/callback"
`);
        expect(config.auth.password.enabled).toBe(true);
        expect(config.auth.oidc.get("example")?.clientSecretEnv).toBe("OIDC_SECRET");
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
