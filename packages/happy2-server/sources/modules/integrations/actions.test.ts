import { webhookDeliveryList } from "../webhook/webhookDeliveryList.js";
import { webhookDeliveryEnqueueSyncSequence } from "../webhook/webhookDeliveryEnqueueSyncSequence.js";
import { webhookDeliveryEnqueuePendingSyncEvents } from "../webhook/webhookDeliveryEnqueuePendingSyncEvents.js";
import { webhookDeliveryEnqueueOutgoingEvent } from "../webhook/webhookDeliveryEnqueueOutgoingEvent.js";
import { webhookDeliveryDispatchDue } from "../webhook/webhookDeliveryDispatchDue.js";
import { slashCommandList } from "../integration/slashCommandList.js";
import { slashCommandInvoke } from "../integration/slashCommandInvoke.js";
import { slashCommandCreate } from "../integration/slashCommandCreate.js";
import { outgoingWebhookCreate } from "../webhook/outgoingWebhookCreate.js";
import { integrationRevoke } from "../integration/integrationRevoke.js";
import { integrationList } from "../integration/integrationList.js";
import { integrationCreate } from "../integration/integrationCreate.js";
import { incomingWebhookInvoke } from "../webhook/incomingWebhookInvoke.js";
import { incomingWebhookCreate } from "../webhook/incomingWebhookCreate.js";
import { botRevoke } from "../bot/botRevoke.js";
import { botList } from "../bot/botList.js";
import { botCreate } from "../bot/botCreate.js";
import { apiCredentialRevoke } from "../integration/apiCredentialRevoke.js";
import { apiCredentialList } from "../integration/apiCredentialList.js";
import { apiCredentialCreate } from "../integration/apiCredentialCreate.js";
import { apiCredentialAuthenticate } from "../integration/apiCredentialAuthenticate.js";
import { userCreateProfile } from "../user/userCreateProfile.js";
import { accountCreatePassword } from "../auth/accountCreatePassword.js";
import { createDatabase, type DrizzleExecutor } from "../drizzle.js";

import { serverSchemaMigrate } from "../server/serverSchemaMigrate.js";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../user/types.js";
import { AesGcmSecretProtector, secretHash } from "./secrets.js";
import { StrictWebhookUrlPolicy } from "./ssrf.js";
import type { WebhookTransportRequest } from "./types.js";
interface Fixture {
    directory: string;
    client: Client;
    executor: DrizzleExecutor;
    protector: AesGcmSecretProtector;
    urlPolicy: StrictWebhookUrlPolicy;
    nowProvider: () => Date;
    admin: User;
    member: User;
    outsider: User;
    chatId: string;
    setNow(value: Date): void;
}
const fixtures: Fixture[] = [];
afterEach(async () => {
    for (const fixture of fixtures.splice(0)) {
        fixture.client.close();
        await rm(fixture.directory, {
            recursive: true,
            force: true,
        });
    }
});
describe("integration actions", () => {
    it("administers bots and one-time scoped API credentials without persisting secrets", async () => {
        const fixture = await createFixture();
        await expect(
            botCreate(fixture.executor, {
                actorUserId: fixture.member.id,
                name: "Unauthorized",
                username: "unauthorized",
            }),
        ).rejects.toMatchObject({
            code: "forbidden",
        });
        const bot = await botCreate(fixture.executor, {
            actorUserId: fixture.admin.id,
            name: "Build Bot",
            username: "build_bot",
            description: "Runs builds",
            ownerUserId: fixture.admin.id,
        });
        const integration = await integrationCreate(fixture.executor, {
            actorUserId: fixture.admin.id,
            kind: "service_account",
            name: "Build service",
            botId: bot.value.id,
            scopes: ["messages:read", "messages:write"],
        });
        const issued = await apiCredentialCreate(fixture.executor, fixture.nowProvider, {
            actorUserId: fixture.admin.id,
            integrationId: integration.value.id,
            name: "CI credential",
            scopes: ["messages:write"],
        });
        expect(issued.token).toMatch(/^happy2_api_/);
        expect(issued.credential).not.toHaveProperty("tokenHash");
        expect(
            await apiCredentialAuthenticate(fixture.executor, issued.token, ["messages:write"]),
        ).toMatchObject({
            integrationId: integration.value.id,
            botId: bot.value.id,
            scopes: ["messages:write"],
        });
        expect(
            await apiCredentialAuthenticate(fixture.executor, issued.token, ["messages:read"]),
        ).toBeUndefined();
        const row = (
            await fixture.client.execute({
                sql: `SELECT token_hash, scopes_json FROM api_credentials WHERE id = ?`,
                args: [issued.credential.id],
            })
        ).rows[0]!;
        expect(row.token_hash).toBe(secretHash(issued.token));
        expect(JSON.stringify(row)).not.toContain(issued.token);
        const listed = await apiCredentialList(
            fixture.executor,
            fixture.admin.id,
            integration.value.id,
        );
        expect(JSON.stringify(listed)).not.toContain(issued.token);
        expect(listed[0]).not.toHaveProperty("tokenHash");
        await apiCredentialRevoke(fixture.executor, fixture.admin.id, issued.credential.id);
        expect(await apiCredentialAuthenticate(fixture.executor, issued.token)).toBeUndefined();
        await botRevoke(fixture.executor, fixture.admin.id, bot.value.id);
        expect((await botList(fixture.executor, fixture.admin.id))[0]).toMatchObject({
            id: bot.value.id,
            active: false,
        });
        expect((await integrationList(fixture.executor, fixture.admin.id))[0]).toMatchObject({
            id: integration.value.id,
            active: false,
        });
    });
    it("authorizes incoming webhook tokens for one fixed bot and chat", async () => {
        const fixture = await createFixture();
        const bot = await botCreate(fixture.executor, {
            actorUserId: fixture.admin.id,
            name: "Deploy Bot",
            username: "deploy_bot",
        });
        const webhook = await incomingWebhookCreate(fixture.executor, {
            actorUserId: fixture.admin.id,
            name: "Deploy notifications",
            botId: bot.value.id,
            chatId: fixture.chatId,
        });
        const sendMessage = vi.fn(async () => ({
            messageId: "message_1",
        }));
        await expect(
            incomingWebhookInvoke(
                fixture.executor,
                webhook.value.token,
                "Deploy complete",
                {
                    sendMessage,
                },
                "deploy-event-1",
            ),
        ).resolves.toEqual({
            messageId: "message_1",
        });
        expect(sendMessage).toHaveBeenCalledWith({
            actorUserId: fixture.admin.id,
            integrationId: webhook.value.integration.id,
            subscriptionId: webhook.value.subscription.id,
            botId: bot.value.id,
            chatId: fixture.chatId,
            text: "Deploy complete",
            idempotencyKey: "deploy-event-1",
        });
        await expect(
            incomingWebhookInvoke(fixture.executor, "happy2_hook_invalid", "Ignored", {
                sendMessage,
            }),
        ).rejects.toMatchObject({
            code: "unauthorized",
        });
        await fixture.client.execute({
            sql: `UPDATE users SET role = 'member' WHERE id = ?`,
            args: [fixture.admin.id],
        });
        await expect(
            incomingWebhookInvoke(fixture.executor, webhook.value.token, "Ignored", {
                sendMessage,
            }),
        ).rejects.toMatchObject({
            code: "unauthorized",
        });
        expect(sendMessage).toHaveBeenCalledTimes(1);
        const stored = (
            await fixture.client.execute({
                sql: `SELECT token_hash FROM webhook_subscriptions WHERE id = ?`,
                args: [webhook.value.subscription.id],
            })
        ).rows[0]!;
        expect(stored.token_hash).toBe(secretHash(webhook.value.token));
        expect(JSON.stringify(webhook.value.subscription)).not.toContain(webhook.value.token);
    });
    it("queues, signs, delivers, and retries outgoing webhook events durably", async () => {
        const fixture = await createFixture();
        const outgoing = await outgoingWebhookCreate(
            fixture.executor,
            fixture.urlPolicy,
            fixture.protector,
            {
                actorUserId: fixture.admin.id,
                name: "Audit sink",
                url: "https://hooks.example.com/events",
                eventTypes: ["message.created", "chat.topicUpdated"],
                chatId: fixture.chatId,
            },
        );
        expect(outgoing.value.signingSecret).toMatch(/^happy2_sign_/);
        const stored = (
            await fixture.client.execute({
                sql: `SELECT signing_secret_ciphertext FROM webhook_subscriptions WHERE id = ?`,
                args: [outgoing.value.subscription.id],
            })
        ).rows[0]!;
        expect(stored.signing_secret_ciphertext).not.toBe(outgoing.value.signingSecret);
        expect(String(stored.signing_secret_ciphertext)).not.toContain(
            outgoing.value.signingSecret,
        );
        const queued = await webhookDeliveryEnqueueOutgoingEvent(
            fixture.executor,
            fixture.nowProvider,
            {
                eventId: "event_1",
                eventType: "message.created",
                chatId: fixture.chatId,
                payload: {
                    messageId: "message_1",
                },
            },
        );
        const duplicate = await webhookDeliveryEnqueueOutgoingEvent(
            fixture.executor,
            fixture.nowProvider,
            {
                eventId: "event_1",
                eventType: "message.created",
                chatId: fixture.chatId,
                payload: {
                    messageId: "ignored_duplicate",
                },
            },
        );
        expect(queued).toHaveLength(1);
        expect(duplicate[0]!.id).toBe(queued[0]!.id);
        let deliveredRequest: WebhookTransportRequest | undefined;
        const transport = {
            deliver: vi.fn(async (request: WebhookTransportRequest) => {
                deliveredRequest = request;
                return {
                    statusCode: 204,
                };
            }),
        };
        await expect(
            webhookDeliveryDispatchDue(
                fixture.executor,
                fixture.urlPolicy,
                fixture.protector,
                fixture.nowProvider,
                transport,
            ),
        ).resolves.toEqual({
            delivered: 1,
            failed: 0,
        });
        expect(deliveredRequest?.allowedAddresses).toEqual([
            {
                address: "8.8.8.8",
                family: 4,
            },
        ]);
        const timestamp = deliveredRequest!.headers["x-happy2-timestamp"]!;
        expect(deliveredRequest!.headers["x-happy2-signature"]).toBe(
            `v1=${createHmac("sha256", outgoing.value.signingSecret).update(`${timestamp}.${deliveredRequest!.body}`).digest("hex")}`,
        );
        expect(
            await webhookDeliveryList(
                fixture.executor,
                fixture.admin.id,
                outgoing.value.integration.id,
            ),
        ).toMatchObject([
            {
                id: queued[0]!.id,
                status: "delivered",
                attempts: 1,
            },
        ]);
        await webhookDeliveryEnqueueOutgoingEvent(fixture.executor, fixture.nowProvider, {
            eventId: "event_2",
            eventType: "message.created",
            chatId: fixture.chatId,
            payload: {
                messageId: "message_2",
            },
        });
        const failing = {
            deliver: vi.fn(async () => ({
                statusCode: 503,
                body: "retry",
            })),
        };
        await expect(
            webhookDeliveryDispatchDue(
                fixture.executor,
                fixture.urlPolicy,
                fixture.protector,
                fixture.nowProvider,
                failing,
            ),
        ).resolves.toEqual({
            delivered: 0,
            failed: 1,
        });
        await expect(
            webhookDeliveryDispatchDue(
                fixture.executor,
                fixture.urlPolicy,
                fixture.protector,
                fixture.nowProvider,
                failing,
            ),
        ).resolves.toEqual({
            delivered: 0,
            failed: 0,
        });
        fixture.setNow(new Date(Date.now() + 5_000));
        await expect(
            webhookDeliveryDispatchDue(
                fixture.executor,
                fixture.urlPolicy,
                fixture.protector,
                fixture.nowProvider,
                transport,
            ),
        ).resolves.toEqual({
            delivered: 1,
            failed: 0,
        });
        expect(
            await webhookDeliveryList(
                fixture.executor,
                fixture.admin.id,
                outgoing.value.integration.id,
            ),
        ).toContainEqual(
            expect.objectContaining({
                eventId: "event_2",
                status: "delivered",
                attempts: 2,
            }),
        );
        const state = (
            await fixture.client.execute(`UPDATE server_sync_state SET sequence = sequence + 1
                 WHERE id = 1 RETURNING sequence`)
        ).rows[0]!;
        const syncEvent = (
            await fixture.client.execute({
                sql: `INSERT INTO sync_events
                        (sequence, kind, chat_id, chat_pts, entity_id, actor_user_id)
                      VALUES (?, 'chat.topicUpdated', ?, 7, ?, ?) RETURNING id`,
                args: [
                    state.sequence as string | number | bigint,
                    fixture.chatId,
                    fixture.chatId,
                    fixture.admin.id,
                ],
            })
        ).rows[0]!;
        const fromSync = await webhookDeliveryEnqueueSyncSequence(
            fixture.executor,
            fixture.nowProvider,
            String(state.sequence),
        );
        const repeated = await webhookDeliveryEnqueueSyncSequence(
            fixture.executor,
            fixture.nowProvider,
            String(state.sequence),
        );
        expect(fromSync).toHaveLength(1);
        expect(repeated[0]!.id).toBe(fromSync[0]!.id);
        expect(fromSync[0]).toMatchObject({
            eventId: `sync:${String(syncEvent.id)}`,
            eventType: "chat.topicUpdated",
        });
        const queuedPayload = (
            await fixture.client.execute({
                sql: `SELECT payload_json FROM webhook_deliveries WHERE id = ?`,
                args: [fromSync[0]!.id],
            })
        ).rows[0]!;
        expect(JSON.parse(String(queuedPayload.payload_json))).toMatchObject({
            eventType: "chat.topicUpdated",
            payload: {
                sequence: String(state.sequence),
                chatId: fixture.chatId,
                chatPts: "7",
                entityId: fixture.chatId,
                actorUserId: fixture.admin.id,
            },
        });
        const nextState = (
            await fixture.client.execute(`UPDATE server_sync_state SET sequence = sequence + 1
                 WHERE id = 1 RETURNING sequence`)
        ).rows[0]!;
        const missedEvent = (
            await fixture.client.execute({
                sql: `INSERT INTO sync_events
                        (sequence, kind, chat_id, chat_pts, entity_id, actor_user_id)
                      VALUES (?, 'message.created', ?, 8, 'message_missed', ?) RETURNING id`,
                args: [
                    nextState.sequence as string | number | bigint,
                    fixture.chatId,
                    fixture.admin.id,
                ],
            })
        ).rows[0]!;
        const recovered = await webhookDeliveryEnqueuePendingSyncEvents(
            fixture.executor,
            fixture.nowProvider,
            10,
        );
        expect(recovered).toContainEqual(
            expect.objectContaining({
                eventId: `sync:${String(missedEvent.id)}`,
                eventType: "message.created",
            }),
        );
        expect(
            await webhookDeliveryEnqueuePendingSyncEvents(
                fixture.executor,
                fixture.nowProvider,
                10,
            ),
        ).toEqual([]);
    });
    it("registers slash commands and queues invocations only for chat members", async () => {
        const fixture = await createFixture();
        const command = await slashCommandCreate(
            fixture.executor,
            fixture.urlPolicy,
            fixture.protector,
            {
                actorUserId: fixture.admin.id,
                name: "Deploy command",
                command: "/deploy",
                description: "Deploy a service",
                usageHint: "/deploy api",
                handlerUrl: "https://hooks.example.com/slash",
            },
        );
        expect(command.value.signingSecret).toMatch(/^happy2_sign_/);
        expect(await slashCommandList(fixture.executor, fixture.member.id)).toMatchObject([
            {
                command: "/deploy",
                active: true,
            },
        ]);
        await expect(
            slashCommandInvoke(fixture.executor, fixture.nowProvider, {
                actorUserId: fixture.outsider.id,
                chatId: fixture.chatId,
                command: "/deploy",
            }),
        ).rejects.toMatchObject({
            code: "not_found",
        });
        const delivery = await slashCommandInvoke(fixture.executor, fixture.nowProvider, {
            actorUserId: fixture.member.id,
            chatId: fixture.chatId,
            command: "/deploy",
            text: "api",
        });
        expect(delivery).toMatchObject({
            status: "pending",
            attempts: 0,
        });
        const transport = {
            deliver: vi.fn(async (_request: WebhookTransportRequest) => ({
                statusCode: 200,
                body: "ok",
            })),
        };
        await expect(
            webhookDeliveryDispatchDue(
                fixture.executor,
                fixture.urlPolicy,
                fixture.protector,
                fixture.nowProvider,
                transport,
            ),
        ).resolves.toEqual({
            delivered: 1,
            failed: 0,
        });
        expect(JSON.parse(transport.deliver.mock.calls[0]![0].body)).toMatchObject({
            payload: {
                command: "/deploy",
                text: "api",
                chatId: fixture.chatId,
                actorUserId: fixture.member.id,
            },
        });
        await integrationRevoke(fixture.executor, fixture.admin.id, command.value.integration.id);
        expect(await slashCommandList(fixture.executor, fixture.member.id)).toEqual([]);
    });
});
async function createFixture(): Promise<Fixture> {
    const directory = await mkdtemp(join(tmpdir(), "happy2-integrations-"));
    const client = createClient({
        url: `file:${join(directory, "happy2.db")}`,
    });
    const executor = createDatabase(client);
    await serverSchemaMigrate(client);
    const admin = await createUser(executor, "admin@example.com", "admin");
    const member = await createUser(executor, "member@example.com", "member");
    const outsider = await createUser(executor, "outsider@example.com", "outsider");
    const chatId = createId();
    await client.execute({
        sql: `INSERT INTO chats
                (id, kind, name, slug, created_by_user_id, owner_user_id, visibility)
              VALUES (?, 'private_channel', 'Deployments', 'deployments', ?, ?, 'private')`,
        args: [chatId, admin.id, admin.id],
    });
    for (const [user, role] of [
        [admin, "owner"],
        [member, "member"],
    ] as const) {
        await client.execute({
            sql: `INSERT INTO chat_members (chat_id, user_id, role, membership_epoch)
                  VALUES (?, ?, ?, ?)`,
            args: [chatId, user.id, role, createId()],
        });
    }
    let now = new Date();
    const protector = new AesGcmSecretProtector(Buffer.alloc(32, 7));
    const urlPolicy = new StrictWebhookUrlPolicy({
        resolve: async () => [
            {
                address: "8.8.8.8",
                family: 4,
            },
        ],
    });
    const fixture: Fixture = {
        directory,
        client,
        executor,
        protector,
        urlPolicy,
        nowProvider: () => now,
        admin,
        member,
        outsider,
        chatId,
        setNow(value) {
            now = value;
        },
    };
    fixtures.push(fixture);
    return fixture;
}
async function createUser(
    executor: DrizzleExecutor,
    email: string,
    username: string,
): Promise<User> {
    const account = await accountCreatePassword(executor, email, "disabled");
    return userCreateProfile(
        executor,
        account.id,
        {
            firstName: username,
            username,
            email,
        },
        {
            provisioned: true,
        },
    );
}
