/** Picks controlled component props while leaving native attributes available for forwarding. */
export function splitProps<Props extends object, Keys extends readonly (keyof Props)[]>(
    props: Props,
    keys: Keys,
): [Pick<Props, Keys[number]>, Omit<Props, Keys[number]>] {
    const selected = {} as Pick<Props, Keys[number]>;
    const rest = { ...props } as Props;
    for (const key of keys) {
        Object.assign(selected, { [key]: props[key] });
        delete rest[key];
    }
    return [selected, rest];
}
