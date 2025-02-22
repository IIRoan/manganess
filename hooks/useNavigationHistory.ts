import { useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { updateNavigationHistory, getPreviousRoute } from '@/services/navigationHistoryService';

export const useNavigationHistory = () => {
    const pathname = usePathname();
    const router = useRouter();

    const handleBackPress = useCallback(async () => {
        const previousRoute = await getPreviousRoute();
        router.replace(previousRoute as any);
    }, [router]);

    useEffect(() => {
        updateNavigationHistory(pathname);
    }, [pathname]);

    return { handleBackPress };
};
