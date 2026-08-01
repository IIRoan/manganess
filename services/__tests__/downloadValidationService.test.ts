import { ImageDownloadStatus } from '@/types/download';

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => false),
}));

const mockFileExists = jest.fn(() => true);
const mockFileSize = jest.fn(() => 50_000);
const mockArrayBuffer = jest.fn();
const mockSliceArrayBuffer = jest.fn();

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map(String).join('/');
    }
    info() {
      return {
        exists: mockFileExists(),
        size: mockFileSize(),
        uri: this.uri,
      };
    }
    slice(start?: number, end?: number) {
      return {
        arrayBuffer: () => mockSliceArrayBuffer(start, end),
      };
    }
    arrayBuffer() {
      return mockArrayBuffer();
    }
  }

  return {
    File: MockFile,
    Directory: class {},
    Paths: { document: 'docs', cache: 'cache' },
  };
});

jest.mock('../chapterStorageService', () => ({
  chapterStorageService: {
    getChapterImages: jest.fn(),
  },
}));

import { downloadValidationService } from '../downloadValidationService';
import { chapterStorageService } from '../chapterStorageService';

describe('downloadValidationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists.mockReturnValue(true);
    mockFileSize.mockReturnValue(50_000);

    // JPEG magic number FF D8 FF
    const jpegHeader = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    mockSliceArrayBuffer.mockResolvedValue(jpegHeader.buffer);
    mockArrayBuffer.mockResolvedValue(jpegHeader.buffer);

    (chapterStorageService.getChapterImages as jest.Mock).mockResolvedValue([
      {
        pageNumber: 1,
        originalUrl: 'https://cdn.example/1.jpg',
        localPath: 'file:///downloads/page_001.jpg',
        fileSize: 50_000,
        downloadStatus: ImageDownloadStatus.COMPLETED,
      },
      {
        pageNumber: 2,
        originalUrl: 'https://cdn.example/2.jpg',
        localPath: 'file:///downloads/page_002.jpg',
        fileSize: 48_000,
        downloadStatus: ImageDownloadStatus.COMPLETED,
      },
    ]);
  });

  it('scores real on-disk jpeg pages as valid (not mock 0x42 bytes)', async () => {
    const result = await downloadValidationService.validateChapterIntegrity(
      'zkz23',
      '39',
      {
        validateFileSize: true,
        validateFormat: true,
        validateContent: false,
        checkDimensions: false,
        deepScan: false,
        repairCorrupted: false,
      }
    );

    expect(result.validImages).toBe(2);
    expect(result.integrityScore).toBe(100);
    expect(result.isValid).toBe(true);
    expect(mockSliceArrayBuffer).toHaveBeenCalled();
  });

  it('still accepts pages when header bytes cannot be read but file size is healthy', async () => {
    mockSliceArrayBuffer.mockRejectedValue(new Error('no slice'));
    mockArrayBuffer.mockRejectedValue(new Error('no buffer'));

    const result = await downloadValidationService.validateChapterIntegrity(
      'zkz23',
      '39',
      {
        validateFileSize: true,
        validateFormat: true,
        validateContent: false,
        checkDimensions: false,
        deepScan: false,
        repairCorrupted: false,
      }
    );

    expect(result.validImages).toBe(2);
    expect(result.integrityScore).toBe(100);
    expect(result.isValid).toBe(true);
  });
});
