import { renderHook, act } from '@testing-library/react-native';

jest.mock('@/services/updateService', () => ({
  performFullUpdateFlow: jest.fn(),
  applyUpdate: jest.fn(),
  checkForUpdate: jest.fn(),
  checkDownloadAndApplyUpdate: jest.fn(),
  areUpdatesAvailable: jest.fn(() => true),
  getUnavailableReason: jest.fn(() => null),
  isUpdateLocked: jest.fn(() => false),
  getUpdateInfo: jest.fn(() => ({
    channel: 'testing',
    runtimeVersion: '1.0.0',
    updateId: 'test-update-id',
    createdAt: new Date('2024-01-01'),
    isEmbeddedLaunch: false,
    isEmergencyLaunch: false,
    checkAutomatically: 'ON_LOAD',
  })),
}));

import { useAppUpdates } from '../useAppUpdates';

const updateService = require('@/services/updateService');

describe('useAppUpdates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock defaults after clearing
    updateService.areUpdatesAvailable.mockReturnValue(true);
    updateService.getUnavailableReason.mockReturnValue(null);
    updateService.isUpdateLocked.mockReturnValue(false);
    updateService.getUpdateInfo.mockReturnValue({
      channel: 'testing',
      runtimeVersion: '1.0.0',
      updateId: 'test-update-id',
      createdAt: new Date('2024-01-01'),
      isEmbeddedLaunch: false,
      isEmergencyLaunch: false,
      checkAutomatically: 'ON_LOAD',
    });
  });

  describe('checkForUpdate', () => {
    it('checks for updates and updates state', async () => {
      updateService.checkForUpdate.mockResolvedValue({
        success: true,
        message: 'Update available',
      });

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.checkForUpdate();
        expect(response.success).toBe(true);
      });

      expect(result.current.updateStatus.isChecking).toBe(false);
      expect(result.current.updateStatus.isUpdateAvailable).toBe(true);
      expect(result.current.lastResult?.message).toBe('Update available');
    });

    it('handles no update available', async () => {
      updateService.checkForUpdate.mockResolvedValue({
        success: false,
        message: 'No updates available',
      });

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.checkForUpdate();
        expect(response.success).toBe(false);
      });

      expect(result.current.updateStatus.isUpdateAvailable).toBe(false);
    });

    it('handles errors during update check', async () => {
      updateService.checkForUpdate.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.checkForUpdate();
        expect(response.success).toBe(false);
        expect(response.message).toContain('Network error');
      });

      expect(result.current.updateStatus.isChecking).toBe(false);
      expect(result.current.updateStatus.error).toContain('Network error');
    });

    it('handles non-Error thrown values', async () => {
      updateService.checkForUpdate.mockRejectedValue('String error');

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.checkForUpdate();
        expect(response.success).toBe(false);
        expect(response.message).toContain('Unknown error');
      });
    });
  });

  describe('checkAndDownload', () => {
    it('runs full update flow and marks readiness', async () => {
      updateService.performFullUpdateFlow.mockImplementation(
        async (_options: any, statusCallback: any) => {
          statusCallback({
            isChecking: false,
            isUpdateAvailable: true,
            isDownloading: false,
            isReady: true,
            error: null,
          });
          return { success: true, message: 'Ready' };
        }
      );

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.checkAndDownload({
          forceReload: false,
        });
        expect(response.success).toBe(true);
      });

      expect(result.current.updateStatus.isReady).toBe(true);
      expect(result.current.lastResult?.message).toBe('Ready');
    });

    it('handles errors during update flow', async () => {
      updateService.performFullUpdateFlow.mockRejectedValue(
        new Error('Download failed')
      );

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.checkAndDownload();
        expect(response.success).toBe(false);
        expect(response.message).toContain('Download failed');
      });
    });

    it('handles non-Error thrown values in update flow', async () => {
      updateService.performFullUpdateFlow.mockRejectedValue('Some error');

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.checkAndDownload();
        expect(response.success).toBe(false);
        expect(response.message).toContain('Unknown error');
      });
    });

    it('tracks downloading state via callback', async () => {
      updateService.performFullUpdateFlow.mockImplementation(
        async (_options: any, statusCallback: any) => {
          statusCallback({
            isChecking: false,
            isUpdateAvailable: true,
            isDownloading: true,
            isReady: false,
            error: null,
          });
          statusCallback({
            isChecking: false,
            isUpdateAvailable: true,
            isDownloading: false,
            isReady: true,
            error: null,
          });
          return { success: true, message: 'Downloaded' };
        }
      );

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        await result.current.checkAndDownload();
      });

      expect(result.current.updateStatus.isReady).toBe(true);
    });
  });

  describe('applyReadyUpdate', () => {
    it('applies ready updates via applyReadyUpdate', async () => {
      updateService.performFullUpdateFlow.mockImplementation(
        async (_options: any, statusCallback: any) => {
          statusCallback({
            isChecking: false,
            isUpdateAvailable: true,
            isDownloading: false,
            isReady: true,
            error: null,
          });
          return { success: true, message: 'Ready' };
        }
      );
      updateService.applyUpdate.mockResolvedValue({
        success: true,
        message: 'Applied',
      });

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        await result.current.checkAndDownload({});
      });

      await act(async () => {
        const applied = await result.current.applyReadyUpdate();
        expect(applied.success).toBe(true);
      });

      expect(updateService.applyUpdate).toHaveBeenCalled();
      expect(result.current.lastResult?.message).toBe('Applied');
    });

    it('returns failure when no update is ready', async () => {
      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.applyReadyUpdate();
        expect(response.success).toBe(false);
        expect(response.message).toBe('No update is ready to apply');
      });
    });

    it('handles errors during apply', async () => {
      updateService.performFullUpdateFlow.mockImplementation(
        async (_options: any, statusCallback: any) => {
          statusCallback({
            isChecking: false,
            isUpdateAvailable: true,
            isDownloading: false,
            isReady: true,
            error: null,
          });
          return { success: true, message: 'Ready' };
        }
      );
      updateService.applyUpdate.mockRejectedValue(new Error('Apply failed'));

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        await result.current.checkAndDownload({});
      });

      await act(async () => {
        const response = await result.current.applyReadyUpdate();
        expect(response.success).toBe(false);
        expect(response.message).toContain('Apply failed');
      });
    });

    it('handles non-Error thrown values during apply', async () => {
      updateService.performFullUpdateFlow.mockImplementation(
        async (_options: any, statusCallback: any) => {
          statusCallback({
            isChecking: false,
            isUpdateAvailable: true,
            isDownloading: false,
            isReady: true,
            error: null,
          });
          return { success: true, message: 'Ready' };
        }
      );
      updateService.applyUpdate.mockRejectedValue('Apply error');

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        await result.current.checkAndDownload({});
      });

      await act(async () => {
        const response = await result.current.applyReadyUpdate();
        expect(response.success).toBe(false);
        expect(response.message).toContain('Unknown error');
      });
    });
  });

  describe('updateAndReload', () => {
    it('performs full update and reload', async () => {
      updateService.checkDownloadAndApplyUpdate.mockImplementation(
        async (statusCallback: any) => {
          statusCallback({
            isChecking: false,
            isUpdateAvailable: true,
            isDownloading: false,
            isReady: true,
            error: null,
          });
          return { success: true, message: 'Updated and reloading' };
        }
      );

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.updateAndReload();
        expect(response.success).toBe(true);
      });

      expect(updateService.checkDownloadAndApplyUpdate).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('handles errors during updateAndReload', async () => {
      updateService.checkDownloadAndApplyUpdate.mockRejectedValue(
        new Error('Reload failed')
      );

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.updateAndReload();
        expect(response.success).toBe(false);
        expect(response.message).toContain('Reload failed');
      });
    });

    it('handles non-Error thrown values in updateAndReload', async () => {
      updateService.checkDownloadAndApplyUpdate.mockRejectedValue(
        'Reload error'
      );

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        const response = await result.current.updateAndReload();
        expect(response.success).toBe(false);
        expect(response.message).toContain('Unknown error');
      });
    });
  });

  describe('isUpdateInProgress', () => {
    it('returns true when checking', async () => {
      let resolveCheck: (value: { success: boolean; message: string }) => void;
      updateService.checkForUpdate.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCheck = resolve;
          })
      );

      const { result } = renderHook(() => useAppUpdates());

      // Start the check but don't await it
      let checkPromise: Promise<any>;
      act(() => {
        checkPromise = result.current.checkForUpdate();
      });

      // Now isChecking should be true (state update has been flushed by act)
      expect(result.current.updateStatus.isChecking).toBe(true);
      expect(result.current.isUpdateInProgress).toBe(true);

      // Resolve the promise and complete the check
      await act(async () => {
        resolveCheck({ success: true, message: '' });
        await checkPromise!;
      });

      expect(result.current.isUpdateInProgress).toBe(false);
    });

    it('returns true when downloading', async () => {
      updateService.performFullUpdateFlow.mockImplementation(
        async (_options: any, statusCallback: any) => {
          statusCallback({
            isChecking: false,
            isUpdateAvailable: true,
            isDownloading: true,
            isReady: false,
            error: null,
          });
          return { success: true, message: '' };
        }
      );

      const { result } = renderHook(() => useAppUpdates());

      await act(async () => {
        await result.current.checkAndDownload();
      });

      // After the flow completes
      expect(result.current.isUpdateInProgress).toBe(true);
    });
  });

  describe('initial state', () => {
    it('has correct initial update status', () => {
      const { result } = renderHook(() => useAppUpdates());

      expect(result.current.updateStatus.isChecking).toBe(false);
      expect(result.current.updateStatus.isUpdateAvailable).toBe(false);
      expect(result.current.updateStatus.isDownloading).toBe(false);
      expect(result.current.updateStatus.isReady).toBe(false);
      expect(result.current.updateStatus.error).toBeNull();
      expect(result.current.lastResult).toBeNull();
    });
  });
});
