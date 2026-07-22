import { access, chmod, mkdtemp, mkdir, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { managedPrivateDirectoryPrepare } from "./managedPrivateDirectoryPrepare.js";

describe("managedPrivateDirectoryPrepare", () => {
    it("creates a private directory below protected or sticky ancestors", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-managed-path-"));
        const directory = join(root, "rig", "endpoints");

        await managedPrivateDirectoryPrepare(directory);

        expect((await stat(directory)).mode & 0o777).toBe(0o700);
    });

    it("rejects a user-owned symlink ancestor before writing through it", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-managed-path-"));
        const target = join(root, "target");
        const redirect = join(root, "redirect");
        await mkdir(target, { mode: 0o700 });
        await symlink(target, redirect);

        await expect(managedPrivateDirectoryPrepare(join(redirect, "endpoints"))).rejects.toThrow(
            "untrusted symbolic link",
        );
        await expect(access(join(target, "endpoints"))).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("rejects a writable ancestor without sticky-directory protection", async () => {
        const root = await mkdtemp(join(tmpdir(), "happy2-managed-path-"));
        const writable = join(root, "writable");
        await mkdir(writable, { mode: 0o700 });
        await chmod(writable, 0o777);

        await expect(managedPrivateDirectoryPrepare(join(writable, "endpoints"))).rejects.toThrow(
            "unprotected writable ancestor",
        );
    });
});
