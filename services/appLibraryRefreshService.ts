import AsyncStorage from '@react-native-async-storage/async-storage';

const BOOKMARK_CHANGED_KEY = 'bookmarkChanged';

export async function markLibraryDataChanged(): Promise<void> {
  await AsyncStorage.setItem(BOOKMARK_CHANGED_KEY, 'true');
}

export async function clearLibraryDataChangedFlag(): Promise<void> {
  await AsyncStorage.setItem(BOOKMARK_CHANGED_KEY, 'false');
}
