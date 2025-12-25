import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/utils/logger';

const SEARCH_HISTORY_KEY = 'search_history';
const MAX_HISTORY_ITEMS = 20;

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

export async function getSearchHistory(): Promise<SearchHistoryItem[]> {
  try {
    const historyStr = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    if (historyStr) {
      return JSON.parse(historyStr);
    }
    return [];
  } catch (error) {
    logger().error('Service', 'Error getting search history', { error });
    return [];
  }
}

export async function addSearchHistoryItem(query: string): Promise<void> {
  try {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 3) return;

    const history = await getSearchHistory();

    // Remove duplicate if exists
    const filteredHistory = history.filter(
      (item) => item.query.toLowerCase() !== trimmedQuery.toLowerCase()
    );

    // Add new item at the beginning
    const newHistory: SearchHistoryItem[] = [
      { query: trimmedQuery, timestamp: Date.now() },
      ...filteredHistory,
    ].slice(0, MAX_HISTORY_ITEMS);

    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory));
  } catch (error) {
    logger().error('Service', 'Error adding search history item', { error });
  }
}

export async function removeSearchHistoryItem(query: string): Promise<void> {
  try {
    const history = await getSearchHistory();
    const filteredHistory = history.filter(
      (item) => item.query.toLowerCase() !== query.toLowerCase()
    );
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filteredHistory));
  } catch (error) {
    logger().error('Service', 'Error removing search history item', { error });
  }
}

export async function clearSearchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (error) {
    logger().error('Service', 'Error clearing search history', { error });
  }
}
