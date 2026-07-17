import { describe, expect, test } from "vitest";
import {
    chatAvatarUpdate,
    chatMessageTextReplace,
    chatPresenceIgnored,
    chatReactionActorsLoad,
    chatReactionCounterUpdate,
    composerTextUpdate,
    happySurfaceFixtureCreate,
} from "../benchmarks/happy-surface-workload.js";
import { engineFactories } from "../benchmarks/surface-store-engines.js";

describe.each(engineFactories)("$name surface-store adapter", (factory) => {
    test("notifies synchronously once for a real update and never for a semantic no-op", () => {
        const store = factory.create({ value: 1 });
        const observed: number[] = [];
        const unsubscribe = store.subscribe(() => observed.push(store.get().value));

        store.update((snapshot) => snapshot);
        expect(observed).toEqual([]);

        store.update((snapshot) => ({ value: snapshot.value + 1 }));
        expect(observed).toEqual([2]);

        unsubscribe();
        store.update((snapshot) => ({ value: snapshot.value + 1 }));
        expect(observed).toEqual([2]);
        store.dispose();
    });

    test("releases all subscriptions on disposal", () => {
        const store = factory.create({ value: 1 });
        let notifications = 0;
        store.subscribe(() => notifications++);

        store.dispose();
        store.update((snapshot) => ({ value: snapshot.value + 1 }));

        expect(notifications).toBe(0);
    });

    test("preserves exact structural sharing for chat and composer workloads", () => {
        const fixture = happySurfaceFixtureCreate();
        const chat = factory.create(fixture.chat);
        const composer = factory.create(fixture.composer);
        let chatNotifications = 0;
        let composerNotifications = 0;
        chat.subscribe(() => chatNotifications++);
        composer.subscribe(() => composerNotifications++);

        const messageIndex = 2_048;
        const originalChat = chat.get();
        const originalMessage = originalChat.messages[messageIndex]!;
        const originalBefore = originalChat.messages[messageIndex - 1]!;
        const originalAfter = originalChat.messages[messageIndex + 1]!;

        chat.update((snapshot) => chatMessageTextReplace(snapshot, messageIndex, "changed"));
        const textChanged = chat.get();
        expect(textChanged).not.toBe(originalChat);
        expect(textChanged.messages).not.toBe(originalChat.messages);
        expect(textChanged.messages[messageIndex]).not.toBe(originalMessage);
        expect(textChanged.messages[messageIndex - 1]).toBe(originalBefore);
        expect(textChanged.messages[messageIndex + 1]).toBe(originalAfter);
        expect(textChanged.messagePositions).toBe(originalChat.messagePositions);
        expect(textChanged.messages[messageIndex]!.sender).toBe(originalMessage.sender);

        chat.update((snapshot) => chatReactionCounterUpdate(snapshot, messageIndex, 42));
        const reactionChanged = chat.get();
        expect(reactionChanged.messages[messageIndex]!.reaction).not.toBe(
            textChanged.messages[messageIndex]!.reaction,
        );
        expect(reactionChanged.messages[messageIndex]!.sender).toBe(originalMessage.sender);

        chat.update(chatPresenceIgnored);
        expect(chat.get()).toBe(reactionChanged);
        expect(chatNotifications).toBe(2);

        composer.update((snapshot) => composerTextUpdate(snapshot, "draft"));
        expect(composer.get()).toEqual({ text: "draft", revision: 1 });
        expect(composerNotifications).toBe(1);
        expect(chat.get()).toBe(reactionChanged);

        chat.dispose();
        composer.dispose();
    });

    test("replaces only messages for a changed canonical avatar projection", () => {
        const fixture = happySurfaceFixtureCreate();
        const chat = factory.create(fixture.chat);
        const original = chat.get();

        chat.update((snapshot) => chatAvatarUpdate(snapshot, "user-7", 2));
        const changed = chat.get();

        expect(changed).not.toBe(original);
        for (const [index, originalMessage] of original.messages.entries()) {
            const changedMessage = changed.messages[index]!;
            if (originalMessage.sender.id === "user-7") {
                expect(changedMessage).not.toBe(originalMessage);
                expect(changedMessage.sender.avatarVersion).toBe(2);
            } else {
                expect(changedMessage).toBe(originalMessage);
            }
        }
        expect(changed.messagePositions).toBe(original.messagePositions);
        chat.dispose();
    });

    test("keeps the snapshot when the loaded reaction actors are semantically unchanged", () => {
        const fixture = happySurfaceFixtureCreate();
        const chat = factory.create(fixture.chat);
        let notifications = 0;
        chat.subscribe(() => notifications++);

        chat.update((snapshot) => chatReactionActorsLoad(snapshot, 42, ["user-1", "user-2"]));
        const loaded = chat.get();
        chat.update((snapshot) => chatReactionActorsLoad(snapshot, 42, ["user-1", "user-2"]));

        expect(chat.get()).toBe(loaded);
        expect(notifications).toBe(1);
        chat.dispose();
    });
});
