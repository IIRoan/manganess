import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useStartupMigration } from '../useStartupMigration';

const mockRefreshBookmarks = jest.fn();
const mockBump = jest.fn();

jest.mock('@/hooks/useBookmarks', () => ({
  useBookmarks: jest.fn(),
}));

jest.mock('@/atoms/libraryRefreshAtom', () => ({
  libraryRefreshAtom: 'libraryRefreshAtom',
}));

jest.mock('@zedux/react', () => ({
  useAtomInstance: jest.fn(),
}));

jest.mock('@/services/startupMigrationService', () => ({
  detectLegacyStorageNeeds: jest.fn(),
  runStartupMigration: jest.fn(),
  STARTUP_MIGRATION_MESSAGES: {
    complete: {
      title: 'Migration complete',
      message: 'Done',
    },
  },
}));

jest.mock('@/services/appLibraryRefreshService', () => ({
  markLibraryDataChanged: jest.fn(),
  clearLibraryDataChangedFlag: jest.fn(),
}));

const { useBookmarks } = require('@/hooks/useBookmarks');
const { useAtomInstance } = require('@zedux/react');
const {
  detectLegacyStorageNeeds,
  runStartupMigration,
} = require('@/services/startupMigrationService');
const {
  markLibraryDataChanged,
  clearLibraryDataChangedFlag,
} = require('@/services/appLibraryRefreshService');

describe('useStartupMigration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (useBookmarks as jest.Mock).mockReturnValue({
      refreshBookmarks: mockRefreshBookmarks,
    });
    (useAtomInstance as jest.Mock).mockReturnValue({
      exports: { bump: mockBump },
    });
    (markLibraryDataChanged as jest.Mock).mockResolvedValue(undefined);
    (clearLibraryDataChangedFlag as jest.Mock).mockResolvedValue(undefined);
    mockRefreshBookmarks.mockResolvedValue(undefined);
    (detectLegacyStorageNeeds as jest.Mock).mockResolvedValue({
      needsMigration: false,
      legacyBookmarkKeyCount: 0,
      legacyMangaIds: [],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does nothing when no legacy data is detected', async () => {
    const { result } = renderHook(() => useStartupMigration());

    await waitFor(() => {
      expect(detectLegacyStorageNeeds).toHaveBeenCalled();
    });

    expect(runStartupMigration).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('refreshes library state before showing completion', async () => {
    (detectLegacyStorageNeeds as jest.Mock).mockResolvedValue({
      needsMigration: true,
      legacyBookmarkKeyCount: 1,
      legacyMangaIds: [],
    });
    (runStartupMigration as jest.Mock).mockImplementation(
      async (onProgress: (progress: any) => void) => {
        onProgress({
          phase: 'migrating_storage',
          title: 'Updating saved data',
          message: 'Migrating bookmarks...',
        });
        onProgress({
          phase: 'complete',
          title: 'Migration complete',
          message: 'Done',
        });
        return {
          outcome: 'completed',
          storageMigrated: 1,
          idsRemapped: 0,
          idsKeptLocal: 0,
          failures: 0,
        };
      }
    );

    const { result } = renderHook(() => useStartupMigration());

    await waitFor(() => {
      expect(mockRefreshBookmarks).toHaveBeenCalled();
    });

    expect(markLibraryDataChanged).toHaveBeenCalled();
    expect(mockBump).toHaveBeenCalled();
    expect(clearLibraryDataChangedFlag).toHaveBeenCalled();
    expect(result.current.progress?.phase).toBe('complete');

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    expect(result.current.isVisible).toBe(false);
    expect(result.current.progress).toBeNull();
  });

  it('does not show the modal when migration resolves to not_needed', async () => {
    (detectLegacyStorageNeeds as jest.Mock).mockResolvedValue({
      needsMigration: true,
      legacyBookmarkKeyCount: 0,
      legacyMangaIds: ['one-piece'],
    });
    (runStartupMigration as jest.Mock).mockResolvedValue({
      outcome: 'not_needed',
      storageMigrated: 0,
      idsRemapped: 0,
      idsKeptLocal: 1,
      failures: 0,
    });

    const { result } = renderHook(() => useStartupMigration());

    await waitFor(() => {
      expect(runStartupMigration).toHaveBeenCalledTimes(1);
    });

    expect(result.current.isVisible).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(mockRefreshBookmarks).not.toHaveBeenCalled();
  });

  it('only runs migration once per app session', async () => {
    (detectLegacyStorageNeeds as jest.Mock).mockResolvedValue({
      needsMigration: true,
      legacyBookmarkKeyCount: 1,
      legacyMangaIds: [],
    });
    (runStartupMigration as jest.Mock).mockResolvedValue({
      outcome: 'completed',
      storageMigrated: 1,
      idsRemapped: 0,
      idsKeptLocal: 0,
      failures: 0,
    });

    const { rerender } = renderHook(() => useStartupMigration());

    await waitFor(() => {
      expect(runStartupMigration).toHaveBeenCalledTimes(1);
    });

    rerender({});

    expect(runStartupMigration).toHaveBeenCalledTimes(1);
  });
});
