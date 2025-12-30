import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  saveMangaMapping,
  getMangaMapping,
  getAnilistIdFromInternalId,
  getMangaMappings,
  removeMangaMapping,
  clearAllMappings,
} from '../mangaMappingService';

const key = (id: string) => `manga_mapping_${id}`;

describe('mangaMappingService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('saves and retrieves a mapping', async () => {
    await saveMangaMapping('int-1', 12345, 'My Manga');

    const stored = await AsyncStorage.getItem(key('int-1'));
    expect(stored).not.toBeNull();

    const mapping = await getMangaMapping('int-1');
    expect(mapping).not.toBeNull();
    expect(mapping).toMatchObject({
      internalId: 'int-1',
      anilistId: 12345,
      title: 'My Manga',
    });
  });

  it('returns AniList id via convenience helper', async () => {
    await saveMangaMapping('int-2', 678, 'Another');
    const anilistId = await getAnilistIdFromInternalId('int-2');
    expect(anilistId).toBe(678);
  });

  it('lists all saved mappings', async () => {
    await saveMangaMapping('a', 1, 'A');
    await saveMangaMapping('b', 2, 'B');

    const mappings = await getMangaMappings();
    expect(Object.keys(mappings)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(mappings.a?.anilistId).toBe(1);
  });

  it('removes individual mappings and clears all', async () => {
    await saveMangaMapping('c', 3, 'C');
    await saveMangaMapping('d', 4, 'D');

    await removeMangaMapping('c');
    expect(await getMangaMapping('c')).toBeNull();

    await clearAllMappings();
    expect(await getMangaMapping('d')).toBeNull();
  });

  describe('error handling', () => {
    it('returns empty object when getMangaMappings fails', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('Storage error'));

      const result = await getMangaMappings();
      expect(result).toEqual({});
    });

    it('handles saveMangaMapping errors gracefully', async () => {
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(
        saveMangaMapping('error-test', 999, 'Error Test')
      ).resolves.not.toThrow();
    });

    it('returns null when getMangaMapping fails', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const result = await getMangaMapping('test-id');
      expect(result).toBeNull();
    });

    it('handles removeMangaMapping errors gracefully', async () => {
      jest
        .spyOn(AsyncStorage, 'removeItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(removeMangaMapping('test-id')).resolves.not.toThrow();
    });

    it('handles clearAllMappings errors gracefully', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(clearAllMappings()).resolves.not.toThrow();
    });

    it('returns null when getAnilistIdFromInternalId has no mapping', async () => {
      const result = await getAnilistIdFromInternalId('nonexistent');
      expect(result).toBeNull();
    });
  });
});
