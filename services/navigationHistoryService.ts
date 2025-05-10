import AsyncStorage from '@react-native-async-storage/async-storage';

interface NavigationHistory {
    paths: string[];
    lastUpdated: number;
}

const HISTORY_KEY = 'navigation_history';
const MAX_HISTORY_LENGTH = 10;

// Function to determine if a path should be excluded from history
const shouldExcludeFromHistory = (path: string): boolean => {
    // Exclude chapter pages from history
    return path.includes('/chapter/');
};

// Extract manga detail path from a chapter path
const getMangaDetailPathFromChapter = (chapterPath: string): string => {
    const parts = chapterPath.split('/');
    // Return "/manga/[id]" from "/manga/[id]/chapter/[num]"
    if (parts.length >= 3 && parts[1] === 'manga') {
        return `/${parts[1]}/${parts[2]}`;
    }
    return '';
};

export const getNavigationHistory = async (): Promise<string[]> => {
    try {
        const historyData = await AsyncStorage.getItem(HISTORY_KEY);
        if (historyData) {
            const history: NavigationHistory = JSON.parse(historyData);
            return history.paths;
        }
        return [];
    } catch (error) {
        console.error('Error getting navigation history:', error);
        return [];
    }
};

export const updateNavigationHistory = async (newPath: string): Promise<void> => {
    try {
        // Skip excluded routes
        if (shouldExcludeFromHistory(newPath)) {
            return;
        }

        const historyData = await AsyncStorage.getItem(HISTORY_KEY);
        let history: NavigationHistory = historyData 
            ? JSON.parse(historyData)
            : { paths: [], lastUpdated: Date.now() };

        // If the path is already the last one in history, don't add it again
        if (history.paths.length > 0 && history.paths[history.paths.length - 1] === newPath) {
            return;
        }

        // Add the new path
        history.paths.push(newPath);

        // Keep only the last MAX_HISTORY_LENGTH items
        if (history.paths.length > MAX_HISTORY_LENGTH) {
            history.paths = history.paths.slice(-MAX_HISTORY_LENGTH);
        }

        history.lastUpdated = Date.now();
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
        console.error('Error updating navigation history:', error);
    }
};

export const getPreviousRoute = async (currentPath: string): Promise<string> => {
    try {
        // Default fallback route
        const DEFAULT_ROUTE = '/mangasearch';
        
        const historyData = await AsyncStorage.getItem(HISTORY_KEY);
        if (!historyData) {
            return DEFAULT_ROUTE;
        }

        const history: NavigationHistory = JSON.parse(historyData);
        
        // If there's no history, return default
        if (history.paths.length === 0) {
            return DEFAULT_ROUTE;
        }
        
        // Special handling for chapter pages (which aren't in history)
        if (shouldExcludeFromHistory(currentPath)) {
            const mangaDetailPath = getMangaDetailPathFromChapter(currentPath);
            
            // If we can't determine manga path, go to default
            if (!mangaDetailPath) {
                return DEFAULT_ROUTE;
            }
            
            // Try to find the route before the manga detail page
            const mangaDetailIndex = history.paths.lastIndexOf(mangaDetailPath);
            
            if (mangaDetailIndex > 0) {
                // Return the route before the manga detail page
                return history.paths[mangaDetailIndex - 1];
            } else if (mangaDetailIndex === 0) {
                // Manga detail is the first item in history
                return DEFAULT_ROUTE;
            } else {
                // Manga detail not in history (unusual case)
                return history.paths[history.paths.length - 1];
            }
        } else {
            // For regular routes, get index in history
            const currentIndex = history.paths.lastIndexOf(currentPath);
            
            // If found and not the first item
            if (currentIndex > 0) {
                return history.paths[currentIndex - 1];
            } else if (currentIndex === 0) {
                return DEFAULT_ROUTE;
            } else {
                // Current path not found in history, return most recent
                return history.paths[history.paths.length - 1];
            }
        }
    } catch (error) {
        console.error('Error getting previous route:', error);
        return '/mangasearch';
    }
};