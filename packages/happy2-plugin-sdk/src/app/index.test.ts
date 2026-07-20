import { describe, expect, it } from "vitest";
import { happyInstanceHostContext } from "./index.js";

describe("happyInstanceHostContext", () => {
    it("parses namespaced durable instance context", () => {
        expect(
            happyInstanceHostContext({
                theme: "dark",
                "happy2/instance": {
                    context: { listId: "list-1" },
                    dataRevision: 4,
                    definitionRevision: 2,
                    id: "instance-1",
                    key: "list-1",
                    future: true,
                },
            }),
        ).toEqual({
            context: { listId: "list-1" },
            dataRevision: 4,
            definitionRevision: 2,
            id: "instance-1",
            key: "list-1",
        });
    });
});
