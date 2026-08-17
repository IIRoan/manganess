/** Collapse manga/chapter ids so telemetry never stores what someone was reading. */
export function sanitizeTelemetryRoute(path: string): string {
  if (!path) {
    return '';
  }
  return path
    .replace(/\/manga\/[^/?#]+/gi, '/manga/[id]')
    .replace(/\/chapter\/[^/?#]+/gi, '/chapter/[n]');
}
