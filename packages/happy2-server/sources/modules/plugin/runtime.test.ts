import { describe, expect, it, vi } from "vitest";
import type {
    PluginSandboxCreateInput,
    PluginSandboxState,
    SandboxProvider,
} from "../sandbox/index.js";
import { SandboxPluginMcpRuntime, type PluginLocalPrepareInput } from "./runtime.js";

describe("SandboxPluginMcpRuntime", () => {
    it("recreates a pre-ownership plugin container before allowing reuse", async () => {
        let state: PluginSandboxState | undefined = {
            containerInstanceId: "existing-instance",
            installationId: "installation-id",
            running: true,
        };
        const removeSandbox = vi.fn(async () => {
            state = undefined;
        });
        const createPluginSandbox = vi.fn(async (input: PluginSandboxCreateInput) => {
            state = {
                containerInstanceId: input.containerInstanceId,
                installationId: input.installationId,
                running: true,
                workspaceUser: `${input.workspaceUserId}:${input.workspaceGroupId}`,
            };
        });
        const provider = {
            createPluginSandbox,
            displayName: "Docker",
            id: "docker",
            inspectPluginSandbox: vi.fn(async () => state),
            locality: "local",
            removeSandbox,
        } as unknown as SandboxProvider;
        const runtime = new SandboxPluginMcpRuntime(async () => provider);
        const input: PluginLocalPrepareInput = {
            containerInstanceId: "replacement-instance",
            containerName: "happy2-plugin-installation-id",
            existingContainerInstanceId: "existing-instance",
            imageTag: "happy2-plugin:immutable",
            installationId: "installation-id",
            workspaceDirectory: "/private/plugin-workspace",
            workspaceGroupId: 20,
            workspaceUserId: 501,
        };

        await expect(runtime.prepareLocal(input)).resolves.toEqual({
            containerInstanceId: "replacement-instance",
            imageTag: "happy2-plugin:immutable",
            reused: false,
        });
        expect(removeSandbox).toHaveBeenCalledWith("happy2-plugin-installation-id");
        expect(createPluginSandbox).toHaveBeenCalledOnce();

        await expect(
            runtime.prepareLocal({
                ...input,
                containerInstanceId: "unused-instance",
                existingContainerInstanceId: "replacement-instance",
            }),
        ).resolves.toEqual({
            containerInstanceId: "replacement-instance",
            imageTag: "happy2-plugin:immutable",
            reused: true,
        });
        expect(createPluginSandbox).toHaveBeenCalledOnce();
    });
});
