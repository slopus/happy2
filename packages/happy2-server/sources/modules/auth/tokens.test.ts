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

    it("issues short-lived chat capabilities bound to one plugin installation", async () => {
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
            actorUserId: "requesting-user",
            agentUserId: "working-agent",
        });

        expectCapabilityExpiresWithinFiveMinutes(token);
        await expect(tokens.verifyPluginChatToken(token)).resolves.toEqual({
            installationId: "chat-management-installation",
            chatId: "current-chat",
            actorUserId: "requesting-user",
            agentUserId: "working-agent",
        });
        await expect(tokens.verifyPluginRuntimeToken(token)).rejects.toThrow();
    });

    it("issues short-lived user capabilities bound to one plugin installation", async () => {
        const config = defaultConfig();
        const keys = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const tokens = await TokenService.create(config, keys);
        const token = await tokens.issuePluginUserToken({
            installationId: "chat-management-installation",
            userId: "referenced-user",
        });

        expectCapabilityExpiresWithinFiveMinutes(token);
        await expect(tokens.verifyPluginUserToken(token)).resolves.toEqual({
            installationId: "chat-management-installation",
            userId: "referenced-user",
        });
        await expect(tokens.verifyPluginChatToken(token)).rejects.toThrow();
    });

    it("issues short-lived message capabilities bound to one plugin installation", async () => {
        const config = defaultConfig();
        const keys = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const tokens = await TokenService.create(config, keys);
        const token = await tokens.issuePluginMessageToken({
            installationId: "chat-management-installation",
            messageId: "message-1",
            actorUserId: "requesting-user",
        });

        expectCapabilityExpiresWithinFiveMinutes(token);
        await expect(tokens.verifyPluginMessageToken(token)).resolves.toEqual({
            installationId: "chat-management-installation",
            messageId: "message-1",
            actorUserId: "requesting-user",
        });
        await expect(tokens.verifyPluginUserToken(token)).rejects.toThrow();
    });

    it("round-trips the bounded agent-call context separately from a user session", async () => {
        const config = defaultConfig();
        const keys = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const service = await TokenService.create(config, keys);
        const token = await service.issuePluginRuntimeToken({
            installationId: "plugin-installation",
            containerInstanceId: "container-incarnation",
            permissions: ["plugins:request-install"],
            agentCall: {
                actorUserId: "actor-user",
                agentUserId: "agent-user",
                callId: "external-call",
                chatId: "chat",
                sessionId: "rig-session",
            },
        });

        await expect(service.verifyPluginRuntimeToken(token)).resolves.toEqual({
            installationId: "plugin-installation",
            containerInstanceId: "container-incarnation",
            permissions: ["plugins:request-install"],
            agentCall: {
                actorUserId: "actor-user",
                agentUserId: "agent-user",
                callId: "external-call",
                chatId: "chat",
                sessionId: "rig-session",
            },
        });
        await expect(service.verify(token)).rejects.toThrow();
    });

    it("issues one-hour access tokens bound to one user and one port-share subdomain", async () => {
        const config = defaultConfig();
        const keys = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const service = await TokenService.create(config, keys);
        const token = await service.issuePortShareAccessToken({
            userId: "member-user",
            subdomain: "docs-a1b2c3",
        });
        const payload = decodeJwt(token);

        expect(Number(payload.exp) - Number(payload.iat)).toBe(3_600);
        await expect(service.verifyPortShareAccessToken(token)).resolves.toEqual({
            userId: "member-user",
            subdomain: "docs-a1b2c3",
        });
        await expect(service.verify(token)).rejects.toThrow();
    });

    it("keeps one-minute port-share redemption credentials distinct from access tokens", async () => {
        const config = defaultConfig();
        const keys = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        const service = await TokenService.create(config, keys);
        const redemptionClaims = { userId: "member-user" };
        const accessClaims = { userId: "member-user", subdomain: "docs-a1b2c3" };
        const redemption = await service.issuePortShareRedemptionToken(redemptionClaims);
        const access = await service.issuePortShareAccessToken(accessClaims);
        const payload = decodeJwt(redemption);

        expect(Number(payload.exp) - Number(payload.iat)).toBe(60);
        await expect(service.verifyPortShareRedemptionToken(redemption)).resolves.toEqual(
            redemptionClaims,
        );
        await expect(service.verifyPortShareAccessToken(redemption)).rejects.toThrow();
        await expect(service.verifyPortShareRedemptionToken(access)).rejects.toThrow();
    });
});

function expectCapabilityExpiresWithinFiveMinutes(token: string): void {
    const payload = decodeJwt(token);
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.exp).toBeTypeOf("number");
    expect(
        Math.abs((payload.exp as number) - ((payload.iat as number) + 5 * 60)),
    ).toBeLessThanOrEqual(1);
}
