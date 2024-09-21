import { useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';

const MAX_HISTORY_LENGTH = 10;

const isExcludedRoute = (path: string) => {
    return path.match(/^\/manga\/[^\/]+$/) || path.match(/^\/manga\/.*\/chapter\/.*$/);
};

export const useNavigationHistory = () => {
    const pathname = usePathname();
    const router = useRouter();

    const updateHistory = useCallback(async (newPath: string) => {
        try {
            const historyString = await AsyncStorage.getItem('navigationHistory');
            let history = historyString ? JSON.parse(historyString) : [];

            // Filter out manga detail and chapter routes
            history = history.filter((path: string) => !isExcludedRoute(path));

            if (!isExcludedRoute(newPath)) {
                history.push(newPath);
            }

            // Keep only the last MAX_HISTORY_LENGTH items
            if (history.length > MAX_HISTORY_LENGTH) {
                history = history.slice(-MAX_HISTORY_LENGTH);
            }

            await AsyncStorage.setItem('navigationHistory', JSON.stringify(history));
        } catch (error) {
            console.error('Error updating navigation history:', error);
        }
    }, []);

    const getPreviousRoute = useCallback(async () => {
        try {
            const historyString = await AsyncStorage.getItem('navigationHistory');
            let history = historyString ? JSON.parse(historyString) : [];

            let previousRoute = '/mangasearch';

            while (history.length > 0) {
                const lastRoute = history.pop();
                if (!isExcludedRoute(lastRoute)) {
                    previousRoute = lastRoute;
                    break;
                }
            }

            await AsyncStorage.setItem('navigationHistory', JSON.stringify(history));

            return previousRoute;
        } catch (error) {
            console.error('Error getting previous route:', error);
            return '/mangasearch';
        }
    }, []);

    const handleBackPress = useCallback(async () => {
        const previousRoute = await getPreviousRoute();
        router.replace(previousRoute as any);
    }, [router, getPreviousRoute]);

    useEffect(() => {
        updateHistory(pathname);
    }, [pathname, updateHistory]);

    return { handleBackPress };
};
