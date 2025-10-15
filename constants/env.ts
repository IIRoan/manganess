export function isDebugEnabled(): boolean {
  try {
    // Prefer Expo public runtime env in client bundles
    const pub = (process.env.EXPO_PUBLIC_DEBUG || '').toString().toLowerCase();
    if (pub === 'true') return true;
    // Fallback to a plain 'debug' for local dev convenience
    const priv = (process.env.debug || '').toString().toLowerCase();
    return priv === 'true';
  } catch {
    return false;
  }
}

// Capture app boot reference for relative timing prefixes
export const appStartTs: number =
  (globalThis as any).performance?.now?.() ?? Date.now();
