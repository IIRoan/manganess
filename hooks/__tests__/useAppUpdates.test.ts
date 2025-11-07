import { renderHook, act } from '@testing-library/react-native';

jest.mock('@/services/updateService', () => ({
  performFullUpdateFlow: jest.fn(),
  applyUpdate: jest.fn(),
  checkForUpdate: jest.fn(),
}));

import { useAppUpdates } from '../useAppUpdates';

const updateService = require('@/services/updateService');

describe('useAppUpdates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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
});
