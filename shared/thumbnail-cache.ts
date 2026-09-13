/**
 * Cache key for a client-side DICOM thumbnail, namespaced by the viewing
 * user. Without the user segment, a thumbnail cached in sessionStorage (or
 * the in-memory Map) under `documentId:position` survives a logout and would
 * be served right back to whoever logs into that same browser tab next,
 * even though they can't see that document. `userId` is null while auth
 * hasn't resolved yet or nobody is signed in.
 */
export function thumbnailCacheKey(
  userId: string | null,
  documentId: number,
  position: number,
): string {
  return `${userId ?? "anon"}:${documentId}:${position}`;
}
