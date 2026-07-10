import { atom, injectStore, api } from '@zedux/react';

export interface LibraryRefreshState {
  version: number;
}

/**
 * Bumped after startup migration or other library-wide storage changes so
 * screens can reload bookmark and recently-read data without requiring navigation.
 */
export const libraryRefreshAtom = atom('libraryRefresh', () => {
  const store = injectStore<LibraryRefreshState>({
    version: 0,
  });

  const bump = () => {
    store.setStateDeep({
      version: store.getState().version + 1,
    });
  };

  return api(store).setExports({
    bump,
  });
});
