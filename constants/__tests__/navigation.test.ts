import {
  NATIVE_STACK_SCREEN_OPTIONS,
  isRootStackRoute,
  shouldForceRootStatusBarVisible,
} from '../navigation';

describe('native navigation options', () => {
  it('uses the platform stack with the native back gesture', () => {
    expect(NATIVE_STACK_SCREEN_OPTIONS.headerShown).toBe(false);
    expect(NATIVE_STACK_SCREEN_OPTIONS.gestureEnabled).toBe(true);
    expect(NATIVE_STACK_SCREEN_OPTIONS).not.toHaveProperty('animation');
    expect(NATIVE_STACK_SCREEN_OPTIONS).not.toHaveProperty('presentation');
  });

  it('treats manga, downloads, and cloudflare as root-stack routes', () => {
    expect(isRootStackRoute('/manga/abc12')).toBe(true);
    expect(isRootStackRoute('/manga/abc12/chapter/1')).toBe(true);
    expect(isRootStackRoute('/downloads')).toBe(true);
    expect(isRootStackRoute('/cloudflare')).toBe(true);
    expect(isRootStackRoute('/')).toBe(false);
    expect(isRootStackRoute('/bookmarks')).toBe(false);
  });

  it('does not let the root layout hide or force the status bar on chapter routes', () => {
    expect(shouldForceRootStatusBarVisible('/manga/abc12/chapter/1')).toBe(
      false
    );
    expect(shouldForceRootStatusBarVisible('/manga/abc12')).toBe(true);
    expect(shouldForceRootStatusBarVisible('/')).toBe(true);
    expect(shouldForceRootStatusBarVisible('/bookmarks')).toBe(true);
  });
});
