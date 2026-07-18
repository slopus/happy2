/** Partitions component-owned props from native attributes that are forwarded to the DOM. */
export function partitionComponentProps<
    Props extends object,
    Keys extends readonly (keyof Props)[],
>(props: Props, keys: Keys): [Pick<Props, Keys[number]>, Omit<Props, Keys[number]>] {
    const selected = {} as Pick<Props, Keys[number]>;
    const rest = { ...props } as Props;
    for (const key of keys) {
        Object.assign(selected, { [key]: props[key] });
        delete rest[key];
    }
    return [selected, rest];
}
