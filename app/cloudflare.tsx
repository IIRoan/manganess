import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useRouter } from 'expo-router';
import { MANGA_API_URL } from '@/constants/Config';
import CustomWebView from '@/components/CustomWebView';
import { Ionicons } from '@expo/vector-icons';
import { WebViewNavigation } from 'react-native-webview';
import { useColorScheme } from 'react-native';

export default function CloudflarePage() {
  const router = useRouter();
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificationComplete, setVerificationComplete] = useState(false);

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setError('Failed to load verification page. Please try again.');
    setIsLoading(false);
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    // Check if we're no longer on a Cloudflare page
    if (!navState.url.includes('cf-browser-verification') && 
        !navState.url.includes('cf_captcha_kind')) {
      setVerificationComplete(true);
    }
  };

  const handleBackPress = () => {
    router.back();
  };

  const handleRetry = () => {
    setError(null);
    setIsLoading(true);
    setVerificationComplete(false);
  };

  // Inject JavaScript to modify the page appearance and remove unnecessary elements
  const injectedJavaScript = `
    document.body.style.backgroundColor = '${colors.background}';
    document.body.style.color = '${colors.text}';
    const elements = document.querySelectorAll('header, footer, nav, aside');
    elements.forEach(element => element.style.display = 'none');
    true;
  `;

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <CustomWebView
            source={{ uri: MANGA_API_URL }}
            style={styles.webView}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            injectedJavaScript={injectedJavaScript}
            allowedHosts={['mangafire.to']}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onNavigationStateChange={handleNavigationStateChange}
            decelerationRate={Platform.OS === 'ios' ? 'normal' : 0.98}
          />
          
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          {verificationComplete && (
            <View style={styles.completeBanner}>
              <Text style={styles.completeText}>Verification Complete!</Text>
              <TouchableOpacity 
                style={styles.continueButton}
                onPress={handleBackPress}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    webView: {
      flex: 1,
    },
    loadingContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      fontSize: 18,
      textAlign: 'center',
      color: colors.error,
      marginBottom: 20,
    },
    retryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 32,
      paddingVertical: 12,
      borderRadius: 8,
    },
    retryButtonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: 'bold',
    },
    backButton: {
      position: 'absolute',
      top: 50,
      left: 10,
      zIndex: 1000,
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      borderRadius: 20,
      padding: 8,
    },
    completeBanner: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.card,
      padding: 20,
      alignItems: 'center',
      borderTopLeftRadius: 15,
      borderTopRightRadius: 15,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: -2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    completeText: {
      color: colors.primary,
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
    },
    continueButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 32,
      paddingVertical: 12,
      borderRadius: 8,
      minWidth: 200,
    },
    continueButtonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: 'bold',
      textAlign: 'center',
    },
  });