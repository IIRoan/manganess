import AsyncStorage from '@react-native-async-storage/async-storage';

export const getLastReadChapter = async (mangaId: string): Promise<string> => {
  try {
    const key = `manga_${mangaId}_read_chapters`;
    const readChapters = await AsyncStorage.getItem(key) || '[]';
    const chaptersArray = JSON.parse(readChapters);

    if (chaptersArray.length === 0) {
      return 'Not started';
    }

    const numericChapters = chaptersArray.map((chapter: string) => parseFloat(chapter));
    const lastReadChapter = Math.max(...numericChapters);

    return `Chapter ${lastReadChapter}`;
  } catch (error) {
    console.error('Error getting last read chapter:', error);
    return 'Unknown';
  }
};
