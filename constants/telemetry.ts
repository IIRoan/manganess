export function getTelemetryUrl(): string {
  return (process.env.EXPO_PUBLIC_TELEMETRY_URL || '').trim();
}

export function getTelemetryProject(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_TELEMETRY_PROJECT || '').trim();
  return fromEnv || 'manganess';
}

export function isTelemetryEnabled(): boolean {
  return getTelemetryUrl().length > 0;
}
