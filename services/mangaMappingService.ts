import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/utils/logger';

interface MangaMapping {
  internalId: string;
  anilistId: number;
  title: string;
  lastUpdated: number;
}

const MAPPING_PREFIX = 'manga_mapping_';

export async function getMangaMappings(): Promise<
  Record<string, MangaMapping>
> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mappingKeys = keys.filter((key) => key.startsWith(MAPPING_PREFIX));
    const mappings = await AsyncStorage.multiGet(mappingKeys);

    return mappings.reduce(
      (acc, [key, value]) => {
        if (value) {
          const internalId = key.replace(MAPPING_PREFIX, '');
          acc[internalId] = JSON.parse(value);
        }
        return acc;
      },
      {} as Record<string, MangaMapping>
    );
  } catch (error) {
    logger().error('Service', 'Error getting manga mappings', { error });
    return {};
  }
}

export async function saveMangaMapping(
  internalId: string,
  anilistId: number,
  title: string
): Promise<void> {
  try {
    const mapping: MangaMapping = {
      internalId,
      anilistId,
      title,
      lastUpdated: Date.now(),
    };
    await AsyncStorage.setItem(
      `${MAPPING_PREFIX}${internalId}`,
      JSON.stringify(mapping)
    );
  } catch (error) {
    logger().error('Service', 'Error saving manga mapping', { error });
  }
}

export async function getMangaMapping(
  internalId: string
): Promise<MangaMapping | null> {
  try {
    const mapping = await AsyncStorage.getItem(
      `${MAPPING_PREFIX}${internalId}`
    );
    return mapping ? JSON.parse(mapping) : null;
  } catch (error) {
    logger().error('Service', 'Error getting manga mapping', { error });
    return null;
  }
}

export async function getAnilistIdFromInternalId(
  internalId: string
): Promise<number | null> {
  const mapping = await getMangaMapping(internalId);
  return mapping ? mapping.anilistId : null;
}

export async function removeMangaMapping(internalId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${MAPPING_PREFIX}${internalId}`);
  } catch (error) {
    logger().error('Service', 'Error removing manga mapping', { error });
  }
}

export async function clearAllMappings(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mappingKeys = keys.filter((key) => key.startsWith(MAPPING_PREFIX));
    await AsyncStorage.multiRemove(mappingKeys);
  } catch (error) {
    logger().error('Service', 'Error clearing manga mappings', { error });
  }
}
