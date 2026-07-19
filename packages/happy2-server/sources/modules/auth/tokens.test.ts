import { generateKeyPairSync } from "node:crypto";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../config/defaults.js";
import { TokenService } from "./tokens.js";

describe("plugin runtime capability tokens", () => {
    it("survive service reconstruction without persisting token bytes", async () => {
        const config = defaultConfig();
        const keys = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const issuer = await TokenService.create(config, keys);
        const token = await issuer.issuePluginRuntimeToken({
            installationId: "plugin-installation",
            containerInstanceId: "container-incarnation",
            permissions: ["plugins:list"],
        });

        const restarted = await TokenService.create(config, keys);
        await expect(restarted.verifyPluginRuntimeToken(token)).resolves.toEqual({
            installationId: "plugin-installation",
            containerInstanceId: "container-incarnation",
            permissions: ["plugins:list"],
        });
        await expect(restarted.verify(token)).rejects.toThrow();
    });

    it("issues non-expiring chat capabilities bound to one plugin installation", async () => {
        const config = defaultConfig();
        const keys = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const tokens = await TokenService.create(config, keys);
        const token = await tokens.issuePluginChatToken({
            installationId: "chat-management-installation",
            chatId: "current-chat",
        });

        expect(decodeJwt(token)).not.toHaveProperty("exp");
        await expect(tokens.verifyPluginChatToken(token)).resolves.toEqual({
            installationId: "chat-management-installation",
            chatId: "current-chat",
        });
        await expect(tokens.verifyPluginRuntimeToken(token)).rejects.toThrow();
    });
});
