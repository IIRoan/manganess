import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';

export const useCloudflareDetection = () => {
  const [isCloudflareDetected, setIsCloudflareDetected] = useState(false);
  const [previousRoute, setPreviousRoute] = useState<string>('/');
  const router = useRouter();

  const checkForCloudflare = useCallback(
    (html: string, currentRoute?: string) => {
      if (
        html.includes('cf-browser-verification') ||
        html.includes('cf_captcha_kind')
      ) {
        setIsCloudflareDetected(true);
        if (currentRoute) {
          setPreviousRoute(currentRoute);
        }
        router.push('/cloudflare');
        return true;
      }
      return false;
    },
    [router]
  );

  const handleVerificationComplete = useCallback(() => {
    setIsCloudflareDetected(false);
    router.replace(previousRoute as any);
  }, [router, previousRoute]);

  const resetCloudflareDetection = useCallback(() => {
    setIsCloudflareDetected(false);
    setPreviousRoute('/');
  }, []);

  return {
    isCloudflareDetected,
    checkForCloudflare,
    handleVerificationComplete,
    resetCloudflareDetection,
  };
};
