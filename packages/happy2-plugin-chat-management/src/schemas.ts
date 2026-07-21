import { z } from "zod/v4";

export const initialMessageSchema = z.strictObject({
    text: z
        .string()
        .min(1)
        .max(40_000)
        .describe("A copied or rephrased opening prompt or informational message."),
    audience: z
        .enum(["agents", "people"])
        .describe("agents starts the current agent; people posts without inference."),
});

export const childCreateSchema = z.strictObject({
    name: z.string().min(1).max(100).describe("Child channel title."),
    description: z
        .string()
        .min(1)
        .max(500)
        .optional()
        .describe("Optional child channel description."),
    agentModelId: z
        .string()
        .min(1)
        .max(128)
        .optional()
        .describe("Optional available agent model ID for this child's independent session."),
    initialMessage: initialMessageSchema.optional(),
});
