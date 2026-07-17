import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type IntegrationMutation, type IssuedSlashCommand } from "../integrations/types.js";

import { generateSigningSecret, type SecretProtector } from "../integrations/secrets.js";
import { type WebhookUrlPolicy } from "../integrations/ssrf.js";
import { constraintConflict } from "./constraintConflict.js";
import { createId } from "@paralleldrive/cuid2";

import { normalizedCommand } from "./impl/normalizedCommand.js";
import { optionalTrimmed } from "./optionalTrimmed.js";
import { slashCommands, webhookSubscriptions } from "../schema.js";
import { slashEventType } from "./impl/slashEventType.js";

import { integrationFinishChange } from "./integrationFinishChange.js";
import { integrationGet } from "./integrationGet.js";
import { getSlashCommandDb } from "./impl/getSlashCommandDb.js";
import { integrationInsert } from "./integrationInsert.js";
import { userRequireIntegrationAdmin } from "./userRequireIntegrationAdmin.js";
import { botRequire } from "./botRequire.js";

/**
 * Registers a unique slashCommands trigger and the webhookSubscriptions route that will receive invocations for its validated bot.
 * Creating command and delivery subscription together prevents discoverable commands from existing without an executable integration endpoint.
 */
export async function slashCommandCreate(
    executor: DrizzleExecutor,
    urlPolicy: WebhookUrlPolicy,
    protector: SecretProtector,
    input: {
        actorUserId: string;
        name: string;
        description?: string;
        command: string;
        usageHint?: string;
        handlerUrl: string;
        botId?: string;
    },
): Promise<IntegrationMutation<IssuedSlashCommand>> {
    const command = normalizedCommand(input.command);
    const handlerUrl = urlPolicy.validateForStorage(input.handlerUrl);
    const signingSecret = generateSigningSecret();
    const ciphertext = await protector.protect(signingSecret);
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, input.actorUserId);
        if (input.botId) await botRequire(tx, input.botId);
        const integration = await integrationInsert(tx, {
            actorUserId: input.actorUserId,
            kind: "slash_command",
            name: input.name,
            description: input.description,
            botId: input.botId,
            scopes: ["commands:receive"],
        });
        const commandId = createId();
        try {
            await tx.insert(slashCommands).values({
                id: commandId,
                integrationId: integration.id,
                command,
                description: optionalTrimmed(input.description, "Command description", 500) ?? null,
                usageHint: optionalTrimmed(input.usageHint, "Usage hint", 500) ?? null,
                handlerUrl,
            });
        } catch (error: unknown) {
            throw constraintConflict(error, "Slash command is already registered");
        }
        await tx.insert(webhookSubscriptions).values({
            id: createId(),
            integrationId: integration.id,
            direction: "outgoing",
            url: handlerUrl,
            signingSecretCiphertext: ciphertext,
            eventTypesJson: JSON.stringify([slashEventType(commandId)]),
        });
        const change = await integrationFinishChange(
            tx,
            input.actorUserId,
            "integration.created",
            integration.id,
        );
        return {
            value: {
                integration: await integrationGet(tx, integration.id),
                command: await getSlashCommandDb(tx, commandId),
                signingSecret,
            },
            change,
        };
    });
}
