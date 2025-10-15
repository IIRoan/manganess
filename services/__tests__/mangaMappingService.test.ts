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
    expect(mappings.a.anilistId).toBe(1);
  });

  it('removes individual mappings and clears all', async () => {
    await saveMangaMapping('c', 3, 'C');
    await saveMangaMapping('d', 4, 'D');

    await removeMangaMapping('c');
    expect(await getMangaMapping('c')).toBeNull();

    await clearAllMappings();
    expect(await getMangaMapping('d')).toBeNull();
  });
});
