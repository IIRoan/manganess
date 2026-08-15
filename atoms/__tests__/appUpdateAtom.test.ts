import { appUpdateAtom } from '../appUpdateAtom';
import { createTestEcosystem } from '../testUtils';

jest.mock('@/services/updateService', () => ({
  areUpdatesAvailable: jest.fn(() => true),
  getUnavailableReason: jest.fn(() => null),
  isUpdateLocked: jest.fn(() => false),
  checkForUpdate: jest.fn(),
  downloadUpdate: jest.fn(),
  applyUpdate: jest.fn(),
}));

const updateService = require('@/services/updateService');

describe('appUpdateAtom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateService.areUpdatesAvailable.mockReturnValue(true);
    updateService.getUnavailableReason.mockReturnValue(null);
    updateService.isUpdateLocked.mockReturnValue(false);
  });

  it('shows an available update and lets Later hide it', async () => {
    updateService.checkForUpdate.mockResolvedValue({
      success: true,
      message: 'Update available',
      updateId: 'update-1',
    });

    const ecosystem = createTestEcosystem();
    const instance = ecosystem.getInstance(appUpdateAtom);

    await instance.exports.check({ showPrompt: true });

    expect(instance.getState()).toMatchObject({
      phase: 'available',
      visible: true,
      isPending: true,
      updateId: 'update-1',
    });

    instance.exports.dismiss();

    expect(instance.getState().visible).toBe(false);
    expect(instance.getState().isPending).toBe(true);

    ecosystem.reset();
  });

  it('closes the prompt on download error when Later is pressed', async () => {
    updateService.downloadUpdate.mockResolvedValue({
      success: false,
      message: 'Network failed',
    });

    const ecosystem = createTestEcosystem();
    const instance = ecosystem.getInstance(appUpdateAtom);

    instance.setState({
      ...instance.getState(),
      phase: 'available',
      visible: true,
      isPending: true,
      updateId: 'update-1',
    });

    await instance.exports.install();

    expect(instance.getState()).toMatchObject({
      phase: 'error',
      visible: true,
      error: 'Network failed',
    });

    instance.exports.dismiss();

    expect(instance.getState().visible).toBe(false);
    expect(instance.getState().phase).toBe('available');

    ecosystem.reset();
  });

  it('does not allow Later during download', async () => {
    let resolveDownload: (value: {
      success: boolean;
      isNew?: boolean;
      message: string;
    }) => void = () => undefined;
    updateService.downloadUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDownload = resolve;
        })
    );
    updateService.applyUpdate.mockResolvedValue({
      success: true,
      message: 'applied',
    });

    const ecosystem = createTestEcosystem();
    const instance = ecosystem.getInstance(appUpdateAtom);

    instance.setState({
      ...instance.getState(),
      phase: 'available',
      visible: true,
      isPending: true,
      updateId: 'update-1',
    });

    const installPromise = instance.exports.install();
    expect(instance.getState().phase).toBe('downloading');
    instance.exports.dismiss();
    expect(instance.getState().visible).toBe(true);

    resolveDownload({ success: true, isNew: true, message: 'downloaded' });
    await installPromise;

    ecosystem.reset();
  });
});
