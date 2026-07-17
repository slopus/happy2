import { describe, expect, it } from "vitest";
import { defaultConfig } from "../config/defaults.js";
import { supportedAuthMethods } from "./methods.js";

describe("supportedAuthMethods", () => {
    it("only reports auth mechanisms the current role can issue", () => {
        const config = defaultConfig();
        expect(supportedAuthMethods(config)).toMatchObject({
            role: "all",
            method: "password",
        });
        config.server.role = "api";
        expect(supportedAuthMethods(config).method).toBeNull();
    });
});
