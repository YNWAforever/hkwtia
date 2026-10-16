// Cursors are forward-only keyset tokens, so "previous" cannot be computed. What a member can honestly
// do is go back to the first page of the same search, so `first` keeps `q` and drops the cursor, and
// only exists once a cursor is in play (page one has nowhere to go back to).
export function directoryPaging(input: {query: string; cursor: string | null; nextCursor: string | null}): {
  first: {q?: string} | null;
  next: {q?: string; cursor: string} | null;
} {
  const q = input.query ? {q: input.query} : {};
  return {
    first: input.cursor ? q : null,
    next: input.nextCursor ? {...q, cursor: input.nextCursor} : null,
  };
}
