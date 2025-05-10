import { useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { updateNavigationHistory, getPreviousRoute } from '@/services/navigationHistoryService';

export const useNavigationHistory = () => {
    const pathname = usePathname();
    const router = useRouter();

    const handleBackPress = useCallback(async () => {
        try {
            const previousRoute = await getPreviousRoute(pathname);
            router.replace(previousRoute as any);
        } catch (error) {
            console.error('Error handling back press:', error);
            // Fallback to search
            router.replace('/mangasearch' as any);
        }
    }, [pathname, router]);

    useEffect(() => {
        // Update history when pathname changes
        updateNavigationHistory(pathname);
    }, [pathname]);

    return { handleBackPress };
};