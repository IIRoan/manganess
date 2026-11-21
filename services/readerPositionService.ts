import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/utils/logger';

const READER_POSITIONS_KEY = 'reader_page_positions';
const MAX_POSITIONS = 500;

type Positions = Record<string, number>;

const entryKey = (mangaId: string, chapter: string) => `${mangaId}:${chapter}`;

let writeChain: Promise<void> = Promise.resolve();

async function readPositions(): Promise<Positions> {
  try {
    const raw = await AsyncStorage.getItem(READER_POSITIONS_KEY);
    return raw ? (JSON.parse(raw) as Positions) : {};
  } catch (error) {
    logger().warn('Storage', 'Failed to read reader positions', { error });
    return {};
  }
}

export async function getReaderPosition(
  mangaId: string,
  chapter: string
): Promise<number> {
  await writeChain;
  const page = (await readPositions())[entryKey(mangaId, chapter)];
  return typeof page === 'number' && page > 0 ? page : 0;
}

export function saveReaderPosition(
  mangaId: string,
  chapter: string,
  pageIndex: number
): Promise<void> {
  writeChain = writeChain.then(async () => {
    try {
      const positions = await readPositions();
      const key = entryKey(mangaId, chapter);
      delete positions[key];
      if (pageIndex > 0) {
        positions[key] = pageIndex;
      }
      const keys = Object.keys(positions);
      for (const stale of keys.slice(0, keys.length - MAX_POSITIONS)) {
        delete positions[stale];
      }
      await AsyncStorage.setItem(READER_POSITIONS_KEY, JSON.stringify(positions));
    } catch (error) {
      logger().warn('Storage', 'Failed to save reader position', { error });
    }
  });
  return writeChain;
}
