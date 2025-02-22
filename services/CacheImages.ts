import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system';

const CACHE_FOLDER = `${FileSystem.cacheDirectory}image_cache/`;

class ImageCache {
  private static instance: ImageCache;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): ImageCache {
    if (!ImageCache.instance) {
      ImageCache.instance = new ImageCache();
    }
    return ImageCache.instance;
  }

  async initializeCache() {
    if (this.initialized) return;

    try {
      const cacheFolder = await FileSystem.getInfoAsync(CACHE_FOLDER);
      if (!cacheFolder.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize cache:', error);
    }
  }

  private getCacheFilename(url: string): string {
    return url.split('/').pop() || url;
  }

  async getCachedImagePath(url: string): Promise<string> {
    try {
      // First ensure cache directory exists
      const cacheFolder = await FileSystem.getInfoAsync(CACHE_FOLDER);
      if (!cacheFolder.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
        this.initialized = true;
      }

      const filename = this.getCacheFilename(url);
      const filePath = `${CACHE_FOLDER}${filename}`;
      
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      
      if (fileInfo.exists) {
        return filePath;
      }

      // Double check directory exists before download
      const cacheFolderCheck = await FileSystem.getInfoAsync(CACHE_FOLDER);
      if (!cacheFolderCheck.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
      }

      const downloadResult = await FileSystem.downloadAsync(url, filePath);
      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`);
      }

      return filePath;
    } catch (error) {
      console.error('Error caching image:', error);
      return url;
    }
  }

  async clearCache(): Promise<void> {
    try {
      const cacheFolder = await FileSystem.getInfoAsync(CACHE_FOLDER);
      if (cacheFolder.exists) {
        await FileSystem.deleteAsync(CACHE_FOLDER);
      }
      // Always ensure the directory exists after clearing
      await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
      this.initialized = true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      // If there's an error, still try to ensure the directory exists
      try {
        await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
        this.initialized = true;
      } catch (dirError) {
        console.error('Failed to create cache directory:', dirError);
      }
    }
  }

  async getCacheSize(): Promise<{ size: number; count: number }> {
    try {
      const cacheFolder = await FileSystem.getInfoAsync(CACHE_FOLDER);
      if (!cacheFolder.exists) {
        return { size: 0, count: 0 };
      }

      const files = await FileSystem.readDirectoryAsync(CACHE_FOLDER);
      let totalSize = 0;

      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(CACHE_FOLDER + file);
        if (fileInfo.exists && fileInfo.size) {
          totalSize += fileInfo.size;
        }
      }

      return {
        size: totalSize,
        count: files.length
      };
    } catch (error) {
      console.error('Error getting cache size:', error);
      return { size: 0, count: 0 };
    }
  }
}

export const imageCache = ImageCache.getInstance();

export function useImageCache(url: string): string {
  const [cachedPath, setCachedPath] = useState<string>(url);

  useEffect(() => {
    let isMounted = true;

    const cacheImage = async () => {
      if (!url) return;
      
      try {
        const path = await imageCache.getCachedImagePath(url);
        if (isMounted) {
          setCachedPath(path);
        }
      } catch (error) {
        console.error('Error in useImageCache:', error);
        if (isMounted) {
          setCachedPath(url);
        }
      }
    };

    cacheImage();

    return () => {
      isMounted = false;
    };
  }, [url]);

  return cachedPath;
}
