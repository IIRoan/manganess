import AsyncStorage from '@react-native-async-storage/async-storage';

interface NavigationHistory {
    paths: string[];
    lastUpdated: number;
}

const HISTORY_KEY = 'navigation_history';
const MAX_HISTORY_LENGTH = 10;

const isExcludedRoute = (path: string) => {
    return path.match(/^\/manga\/[^\/]+$/) || path.match(/^\/manga\/.*\/chapter\/.*$/);
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
        const historyData = await AsyncStorage.getItem(HISTORY_KEY);
        let history: NavigationHistory = historyData 
            ? JSON.parse(historyData)
            : { paths: [], lastUpdated: Date.now() };

        // Filter out manga detail and chapter routes
        history.paths = history.paths.filter(path => !isExcludedRoute(path));

        if (!isExcludedRoute(newPath)) {
            history.paths.push(newPath);
        }

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

export const getPreviousRoute = async (): Promise<string> => {
    try {
        const historyData = await AsyncStorage.getItem(HISTORY_KEY);
        let history: NavigationHistory = historyData 
            ? JSON.parse(historyData)
            : { paths: [], lastUpdated: Date.now() };

        let previousRoute = '/mangasearch';

        while (history.paths.length > 0) {
            const lastRoute = history.paths.pop();
            if (!isExcludedRoute(lastRoute!)) {
                previousRoute = lastRoute!;
                break;
            }
        }

        history.lastUpdated = Date.now();
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));

        return previousRoute;
    } catch (error) {
        console.error('Error getting previous route:', error);
        return '/mangasearch';
    }
};
