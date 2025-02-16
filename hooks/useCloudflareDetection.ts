import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

export const useCloudflareDetection = () => {
  const [isCloudflareDetected, setIsCloudflareDetected] = useState(false);
  const [previousRoute, setPreviousRoute] = useState<string>('/');
  const router = useRouter();

  const checkForCloudflare = (html: string, currentRoute?: string) => {
    if (html.includes('cf-browser-verification') || html.includes('cf_captcha_kind')) {
      setIsCloudflareDetected(true);
      if (currentRoute) {
        setPreviousRoute(currentRoute);
      }
      router.push('/cloudflare');
      return true;
    }
    return false;
  };

  const handleVerificationComplete = () => {
    setIsCloudflareDetected(false);
    router.replace(previousRoute as any);
  };

  return {
    isCloudflareDetected,
    checkForCloudflare,
    handleVerificationComplete,
    resetCloudflareDetection: () => {
      setIsCloudflareDetected(false);
      setPreviousRoute('/');
    }
  };
};