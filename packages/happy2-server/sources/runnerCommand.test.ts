import { describe, expect, it } from "vitest";
import { happy2Usage, parseHappy2Command } from "./runnerCommand.js";

describe("Happy (2) package commands", () => {
    it("keeps the all-in-one server as the default and selects backend-only explicitly", () => {
        expect(parseHappy2Command([], {})).toEqual({ kind: "all", configPath: undefined });
        expect(parseHappy2Command(["--config", "happy2.toml"], {})).toEqual({
            kind: "all",
            configPath: "happy2.toml",
        });
        expect(parseHappy2Command(["backend"], { HAPPY2_CONFIG: "backend.toml" })).toEqual({
            kind: "backend",
            configPath: "backend.toml",
        });
    });

    it("parses web-only runtime settings from flags or the environment", () => {
        expect(
            parseHappy2Command(
                [
                    "web",
                    "--backend-url",
                    "http://happy2-backend:3000",
                    "--host",
                    "0.0.0.0",
                    "--port",
                    "8080",
                    "--trusted-proxy-hops",
                    "1",
                ],
                {},
            ),
        ).toEqual({
            kind: "web",
            backendUrl: "http://happy2-backend:3000",
            host: "0.0.0.0",
            port: 8080,
            trustedProxyHops: 1,
        });
        expect(
            parseHappy2Command(["web"], {
                HAPPY2_BACKEND_URL: "https://backend.example.com",
                HAPPY2_WEB_HOST: "::",
                HAPPY2_WEB_PORT: "4000",
                HAPPY2_WEB_TRUSTED_PROXY_HOPS: "2",
            }),
        ).toEqual({
            kind: "web",
            backendUrl: "https://backend.example.com",
            host: "::",
            port: 4000,
            trustedProxyHops: 2,
        });
    });

    it("rejects incomplete and invalid web commands with useful usage", () => {
        expect(parseHappy2Command(["web"], {})).toEqual({
            kind: "invalid",
            message: "The web command requires --backend-url or HAPPY2_BACKEND_URL.",
        });
        expect(
            parseHappy2Command(["web", "--backend-url", "http://backend", "--port", "x"], {}),
        ).toEqual({
            kind: "invalid",
            message: "Happy (2) web port must be a non-negative integer.",
        });
        expect(happy2Usage()).toContain("happy2 backend");
        expect(happy2Usage()).toContain("happy2 web --backend-url");
    });
});
