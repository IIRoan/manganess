import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';

jest.mock('expo-file-system', () => {
  class MockDirectory {
    path: string;
    exists = true;
    constructor(parent: any, name?: string) {
      this.path = name ? `${parent.path ?? parent}/${name}` : parent;
    }
    async create() {
      this.exists = true;
    }
    delete() {
      this.exists = false;
    }
  }

  class MockFile {
    uri: string;
    exists = true;
    size = 64;
    constructor(dirOrPath: any, name?: string) {
      this.uri = name ? `${dirOrPath.path ?? dirOrPath}/${name}` : dirOrPath;
    }
    info() {
      return { exists: this.exists, size: this.size };
    }
    delete() {
      this.exists = false;
    }
    static async downloadFileAsync(_url: string, file: MockFile) {
      file.exists = true;
      return file;
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: '/cache' },
  };
});

import { imageCache, useImageCache, useMangaImageCache } from '../CacheImages';

describe('CacheImages hooks', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses cached image path for generic cache hook', async () => {
    const spy = jest
      .spyOn(imageCache, 'getCachedImagePath')
      .mockResolvedValue('cached-uri');

    const { result } = renderHook(() => useImageCache('https://img/test.jpg'));

    expect(result.current).toBe('https://img/test.jpg');

    await waitFor(() => {
      expect(result.current).toBe('cached-uri');
    });
    expect(spy).toHaveBeenCalledWith(
      'https://img/test.jpg',
      'search',
      undefined
    );
  });

  it('validates manga image cache via dedicated hook', async () => {
    const spy = jest
      .spyOn(imageCache, 'validateAndUpdateCache')
      .mockResolvedValue('validated-uri');

    const { result, rerender } = renderHook(
      ({ mangaId, url }) => useMangaImageCache(mangaId, url),
      { initialProps: { mangaId: 'm1', url: 'https://img/m1.jpg' } }
    );

    expect(result.current).toBe('https://img/m1.jpg');

    await waitFor(() => {
      expect(result.current).toBe('validated-uri');
    });
    expect(spy).toHaveBeenCalledWith('m1', 'https://img/m1.jpg');

    rerender({ mangaId: 'm2', url: 'https://img/m2.jpg' });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('m2', 'https://img/m2.jpg');
    });
  });
});
