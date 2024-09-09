import AsyncStorage from '@react-native-async-storage/async-storage';

interface MangaMapping {
  internalId: string;
  anilistId: number;
  title: string;
}

export async function saveMangaMapping(internalId: string, anilistId: number, title: string): Promise<void> {
  try {
    const mapping: MangaMapping = { internalId, anilistId, title };
    await AsyncStorage.setItem(`manga_mapping_${internalId}`, JSON.stringify(mapping));
  } catch (error) {
    console.error('Error saving manga mapping:', error);
  }
}

export async function getMangaMapping(internalId: string): Promise<MangaMapping | null> {
  try {
    const mapping = await AsyncStorage.getItem(`manga_mapping_${internalId}`);
    return mapping ? JSON.parse(mapping) : null;
  } catch (error) {
    console.error('Error getting manga mapping:', error);
    return null;
  }
}

export async function getAnilistIdFromInternalId(internalId: string): Promise<number | null> {
  const mapping = await getMangaMapping(internalId);
  return mapping ? mapping.anilistId : null;
}

export async function searchAnilistManga(title: string): Promise<{ id: number, title: string } | null> {
  // Implement AniList search API call here
  // This is a placeholder implementation
  console.log('Searching AniList for:', title);
  return null;
}
