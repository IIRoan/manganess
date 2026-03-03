import React from 'react';
import { Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '@/hooks/useOffline';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';

export const OfflineIndicator: React.FC = () => {
  const { showOfflineIndicator, isOffline } = useOffline();
  const insets = useSafeAreaInsets();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const pathname = usePathname();
  const hideOnChapterRoute = React.useMemo(
    () => pathname?.includes('/chapter/'),
    [pathname]
  );

  React.useEffect(() => {
    if (hideOnChapterRoute) {
      opacity.setValue(0);
      return;
    }

    if (showOfflineIndicator && isOffline) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [showOfflineIndicator, isOffline, opacity, hideOnChapterRoute]);

  if (hideOnChapterRoute) {
    return null;
  }

  if (!showOfflineIndicator && !isOffline) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: isOffline ? '#FF6B6B' : '#4ECDC4',
          top: insets.top + 8,
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons
        name={isOffline ? 'cloud-offline-outline' : 'cloud-done-outline'}
        size={16}
        color="#FFFFFF"
        style={styles.icon}
      />
      <Text style={styles.text}>
        {isOffline ? 'Offline Mode' : 'Back Online'}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
