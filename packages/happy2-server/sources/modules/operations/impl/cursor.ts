/** Stable timestamp/id pair used to continue administrative pagination without skipping ties. */
export interface Cursor {
    at: string;
    id: string;
}
