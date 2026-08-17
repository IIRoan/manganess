/** Platform native stack: OS push/pop and edge swipe. Previous screen stays attached. */
export const NATIVE_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  gestureEnabled: true,
} as const;

/** Skip a Home continue-reading rescan if one just ran. */
export const RECENT_READ_FOCUS_THROTTLE_MS = 2000;

/**
 * Root layout may restore a visible status bar on these routes.
 * Chapter screens own hide/show from reader controls — the parent must not
 * call `StatusBar.setHidden(true)` or render `<StatusBar hidden={false} />`
 * while a chapter is open, or it can override the reader after it mounts.
 */
export function shouldForceRootStatusBarVisible(pathname: string): boolean {
  return !pathname.includes('/chapter/');
}

/**
 * Root-stack routes sit above the tab navigator.
 * Keep the last tab bar state so Home does not relayout while covered.
 */
export function isRootStackRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/manga/') ||
    pathname === '/downloads' ||
    pathname.startsWith('/downloads/') ||
    pathname === '/cloudflare'
  );
}
