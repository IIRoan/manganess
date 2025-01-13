import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';

export const useCloudflareDetection = () => {
  const [isCloudflareDetected, setIsCloudflareDetected] = useState(false);
  const router = useRouter();

  const checkForCloudflare = (html: string) => {
    if (html.includes('cf-browser-verification') || html.includes('cf_captcha_kind')) {
      setIsCloudflareDetected(true);
      router.push('/cloudflare');
      return true;
    }
    return false;
  };

  return {
    isCloudflareDetected,
    checkForCloudflare,
    resetCloudflareDetection: () => setIsCloudflareDetected(false)
  };
};