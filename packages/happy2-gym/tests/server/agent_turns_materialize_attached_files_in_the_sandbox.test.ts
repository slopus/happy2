import { describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import type { SandboxFileIngressInput } from "happy2-server";
import { createMockRigDaemon, MockAgentSandboxRuntime, type MockRigDaemon } from "happy2-gym/rig";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("agent turn attachments", () => {
    it("materializes a direct-message attachment and submits its exact sandbox path", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const sandbox = new MockAgentSandboxRuntime();
        await using server = await agentServer(rig, sandbox);
        const owner = await server.createUser({ username: "attachment_owner", firstName: "Owner" });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);
        const contents = onePixelPng();
        const fileId = await uploadAttachment(asOwner, "logo-white.png", contents);
        const longName = `${"界".repeat(100)}.png`;
        const longFileId = await uploadAttachment(asOwner, longName, contents);

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Describe this image",
            attachmentFileIds: [fileId, longFileId],
        });
        expect(sent.statusCode).toBe(201);
        const messageId = sent.json().message.id as string;
        const run = await waitForRun(rig, 1);
        const attachment = promptAttachments(run.text)[0];
        expect(attachment).toMatchObject({
            fileId,
            name: "logo-white.png",
            contentType: "image/png",
            size: contents.length,
            path: `/workspace/.context/downloads/happy2-attachment-${messageId}-${fileId}-logo-white.png`,
        });
        expect(sandbox.copiedToSandboxContents.get(attachment!.path as string)).toEqual(contents);
        expect(sandbox.copiedToSandbox).toContainEqual(
            expect.objectContaining({
                containerName: sandbox.createdContainers[0]!.containerName,
                destinationPath: attachment!.path,
            }),
        );
        const longAttachment = promptAttachments(run.text).find(
            ({ fileId: candidate }) => candidate === longFileId,
        );
        expect(longAttachment).toBeDefined();
        expect(
            Buffer.byteLength((longAttachment!.path as string).split("/").at(-1)!),
        ).toBeLessThanOrEqual(255);
        expect(sandbox.copiedToSandboxContents.get(longAttachment!.path as string)).toEqual(
            contents,
        );
        rig.completeRun(run.runId, "The image is readable.");
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(sandbox.copiedToSandboxContents.get(attachment!.path as string)).toEqual(contents);
        expect(sandbox.copiedToSandboxContents.get(longAttachment!.path as string)).toEqual(
            contents,
        );
    });

    it("materializes an attachment addressed to the default channel agent", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const sandbox = new MockAgentSandboxRuntime();
        await using server = await agentServer(rig, sandbox);
        const owner = await server.createUser({
            username: "channel_attachment_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        await configureAgentImage(asOwner);
        const channel = await asOwner.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Image review",
            slug: "image-review",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        const contents = onePixelPng();
        const fileId = await uploadAttachment(asOwner, "channel-image.png", contents);

        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            audience: "agents",
            text: "Inspect the attached image",
            attachmentFileIds: [fileId],
        });
        expect(sent.statusCode).toBe(201);
        const messageId = sent.json().message.id as string;
        const run = await waitForRun(rig, 1);
        const current = promptRecords(run.text).find(
            ({ text }) => text === "Inspect the attached image",
        );
        expect(current?.addressedToYou).toBe(true);
        expect(current?.attachments).toEqual([
            expect.objectContaining({
                fileId,
                path: `/workspace/.context/downloads/happy2-attachment-${messageId}-${fileId}-channel-image.png`,
            }),
        ]);
        const path = current!.attachments[0]!.path as string;
        expect(sandbox.copiedToSandboxContents.get(path)).toEqual(contents);
    });

    it("does not submit after losing its lease during a workspace copy", async () => {
        await using rig = await createMockRigDaemon();
        rig.setAutomaticReply(undefined);
        const sandbox = new PausedAttachmentSandbox();
        await using server = await agentServer(rig, sandbox);
        const owner = await server.createUser({
            username: "lease_attachment_owner",
            firstName: "Owner",
        });
        const asOwner = server.as(owner);
        const chatId = await createAgent(asOwner);
        const fileId = await uploadAttachment(asOwner, "lease-image.png", onePixelPng());
        const sent = await asOwner.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Inspect this only if you still own the turn",
            attachmentFileIds: [fileId],
        });
        expect(sent.statusCode).toBe(201);
        const messageId = sent.json().message.id as string;
        await sandbox.copyStarted;

        const database = createClient({ url: server.config.database.url });
        try {
            await database.execute({
                sql: "UPDATE agent_turns SET worker_id = ? WHERE user_message_id = ?",
                args: ["winning-worker", messageId],
            });
        } finally {
            database.close();
        }
        sandbox.resumeCopy();
        await sandbox.copyFinished;
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(rig.submissionAttemptCount).toBe(0);
        expect(rig.submittedRuns).toEqual([]);
    });
});

class PausedAttachmentSandbox extends MockAgentSandboxRuntime {
    readonly copyStarted: Promise<void>;
    readonly copyFinished: Promise<void>;
    private finishCopy!: () => void;
    private releaseCopy!: () => void;

    constructor() {
        super();
        this.copyStarted = new Promise((resolve) => {
            this.finishCopy = resolve;
        });
        this.copyFinished = new Promise((resolve) => {
            this.releaseCopy = resolve;
        });
    }

    resumeCopy(): void {
        this.releaseCopy();
    }

    override async copyFileToSandbox(
        input: SandboxFileIngressInput,
        signal?: AbortSignal,
    ): Promise<void> {
        await super.copyFileToSandbox(input, signal);
        this.finishCopy();
        await this.copyFinished;
    }
}

function agentServer(rig: MockRigDaemon, sandbox: MockAgentSandboxRuntime) {
    return createGymServer({
        agentSandbox: sandbox,
        databaseMode: "file",
        configure(config) {
            config.agents.enabled = true;
            config.agents.socketPath = rig.socketPath;
            config.agents.tokenPath = rig.tokenPath;
            config.agents.defaultCwd = rig.workspaceRoot;
        },
    });
}

async function createAgent(client: GymRequestClient): Promise<string> {
    await configureAgentImage(client);
    const response = await client.post("/v0/chats/createAgent", {
        name: "Image inspector",
        username: "image_inspector",
    });
    expect(response.statusCode).toBe(201);
    return response.json().chat.id as string;
}

async function configureAgentImage(client: GymRequestClient): Promise<void> {
    let catalog = (await client.get("/v0/admin/agentImages")).json() as {
        defaultImageId?: string;
        images: Array<{ builtinKey?: string; id: string; status: string }>;
    };
    if (catalog.defaultImageId) return;
    const image = catalog.images.find(({ builtinKey }) => builtinKey === "daycare-minimal");
    if (!image) throw new Error("Daycare Minimal image was not seeded");
    if (image.status !== "ready" && image.status !== "building")
        expect(
            (await client.post(`/v0/admin/agentImages/${image.id}/buildImage`, {})).statusCode,
        ).toBe(202);
    await waitFor(async () => {
        catalog = (await client.get("/v0/admin/agentImages")).json() as typeof catalog;
        return catalog.images.find(({ id }) => id === image.id)?.status === "ready";
    }, "the default agent image to build");
    expect(
        (await client.post(`/v0/admin/agentImages/${image.id}/setDefaultImage`, {})).statusCode,
    ).toBe(200);
}

async function uploadAttachment(
    client: GymRequestClient,
    filename: string,
    contents: Buffer,
): Promise<string> {
    const boundary = "happy2-agent-attachment-boundary";
    const body = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        contents,
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await client.post("/v0/files/upload", body, {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(response.statusCode).toBe(201);
    return response.json().file.id as string;
}

function promptAttachments(text: string): Array<Record<string, any>> {
    return text
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as Record<string, any>);
}

function promptRecords(text: string): Array<Record<string, any>> {
    return promptAttachments(text);
}

function onePixelPng(): Buffer {
    return Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
    );
}

async function waitForRun(rig: MockRigDaemon, count: number) {
    await waitFor(() => rig.submittedRuns.length >= count, `${count} submitted Rig run(s)`);
    return rig.submittedRuns[count - 1]!;
}

async function waitFor(
    check: () => boolean | Promise<boolean>,
    description: string,
    timeoutMs = 4_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error(`Timed out waiting for ${description}`);
}
