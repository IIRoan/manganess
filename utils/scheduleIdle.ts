/**
 * Yield the JS thread so the current navigation/paint can finish first.
 */
export function scheduleIdle(task: () => void): () => void {
  const timeoutId = setTimeout(task, 0);
  return () => clearTimeout(timeoutId);
}
