export type ReactionSelector =
    | { readonly emoji: string; readonly customEmojiId?: never }
    | { readonly emoji?: never; readonly customEmojiId: string };
