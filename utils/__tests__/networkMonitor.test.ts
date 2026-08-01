import axios from 'axios';
import { isDebugEnabled } from '@/constants/env';
import { logger } from '@/utils/logger';
import {
  installNetworkMonitor,
  isSoftNetworkFailureStatus,
  resetNetworkMonitorForTests,
} from '../networkMonitor';

jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => true),
}));

jest.mock('@/utils/logger', () => {
  const warn = jest.fn();
  const error = jest.fn();
  const info = jest.fn();
  const debug = jest.fn();
  return {
    logger: () => ({ warn, error, info, debug }),
  };
});

const mockedIsDebugEnabled = isDebugEnabled as jest.MockedFunction<
  typeof isDebugEnabled
>;

describe('networkMonitor', () => {
  beforeEach(() => {
    resetNetworkMonitorForTests();
    jest.clearAllMocks();
    mockedIsDebugEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    resetNetworkMonitorForTests();
  });

  it('treats 404 as a soft/recoverable network failure', () => {
    expect(isSoftNetworkFailureStatus(404)).toBe(true);
    expect(isSoftNetworkFailureStatus(500)).toBe(false);
    expect(isSoftNetworkFailureStatus(403)).toBe(false);
  });

  it('logs HTTP 404 failures as warnings, not errors', async () => {
    const monitored = axios.create({
      adapter: async (config) => {
        const error: any = new Error('Request failed with status code 404');
        error.config = config;
        error.response = {
          status: 404,
          data: {},
          config,
          headers: {},
          statusText: 'Not Found',
        };
        error.isAxiosError = true;
        return Promise.reject(error);
      },
    });
    installNetworkMonitor(monitored);

    const log = logger();
    await expect(
      monitored.get('https://mangafire.to/api/chapters/7333615')
    ).rejects.toBeDefined();

    expect(log.warn).toHaveBeenCalledWith(
      'Network',
      expect.stringContaining('404'),
      expect.objectContaining({ recoverable: true })
    );
    expect(log.error).not.toHaveBeenCalledWith(
      'Network',
      expect.stringContaining('404'),
      expect.anything()
    );
  });

  it('logs non-404 failures as errors', async () => {
    const monitored = axios.create({
      adapter: async (config) => {
        const error: any = new Error('Request failed with status code 500');
        error.config = config;
        error.response = {
          status: 500,
          data: {},
          config,
          headers: {},
          statusText: 'Error',
        };
        error.isAxiosError = true;
        return Promise.reject(error);
      },
    });
    installNetworkMonitor(monitored);

    const log = logger();
    await expect(
      monitored.get('https://mangafire.to/api/titles/z1my2')
    ).rejects.toBeDefined();

    expect(log.error).toHaveBeenCalledWith(
      'Network',
      expect.stringContaining('500'),
      expect.anything()
    );
  });
});
