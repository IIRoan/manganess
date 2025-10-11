import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Colors, ColorScheme } from '@/constants/Colors';
import { NavigationEntry } from '@/types/navigation';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';

const { height: screenHeight } = Dimensions.get('window');

interface NavigationHistoryPanelProps {
  visible: boolean;
  onClose: () => void;
  maxItems?: number;
}

const NavigationHistoryPanel: React.FC<NavigationHistoryPanelProps> = ({
  visible,
  onClose,
  maxItems = 20,
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const { navigationState, navigateTo, clearHistory } = useNavigationHistory();
  const [selectedEntry, setSelectedEntry] = useState<NavigationEntry | null>(
    null
  );

  const colors = Colors[colorScheme];
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          onClose();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const handleEntryPress = async (entry: NavigationEntry) => {
    await navigateTo(entry.path, { replace: true });
    onClose();
  };

  const handleClearHistory = async () => {
    await clearHistory();
    onClose();
  };

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const getContextIcon = (context: string): keyof typeof Ionicons.glyphMap => {
    const contextIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
      browse: 'compass',
      reading: 'book',
      search: 'search',
      settings: 'settings',
    };
    return contextIcons[context] || 'document';
  };

  const groupedHistory = navigationState.contextHistory
    .slice(-maxItems)
    .reverse()
    .reduce(
      (groups, entry) => {
        const date = new Date(entry.timestamp).toDateString();
        if (!groups[date]) {
          groups[date] = [];
        }
        groups[date].push(entry);
        return groups;
      },
      {} as Record<string, NavigationEntry[]>
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          style={[
            styles.panel,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <BlurView
            intensity={100}
            tint={colorScheme === 'dark' ? 'dark' : 'light'}
            style={styles.blurContainer}
          >
            <View style={styles.handle} />

            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>
                Navigation History
              </Text>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.clearButton, { borderColor: colors.border }]}
                  onPress={handleClearHistory}
                >
                  <Ionicons
                    name="trash"
                    size={16}
                    color={colors.tabIconDefault}
                  />
                  <Text
                    style={[
                      styles.clearButtonText,
                      { color: colors.tabIconDefault },
                    ]}
                  >
                    Clear
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {Object.entries(groupedHistory).map(([date, entries]) => (
                <View key={date} style={styles.dateGroup}>
                  <Text
                    style={[
                      styles.dateHeader,
                      { color: colors.tabIconDefault },
                    ]}
                  >
                    {date === new Date().toDateString() ? 'Today' : date}
                  </Text>

                  {entries.map((entry, index) => (
                    <TouchableOpacity
                      key={`${entry.path}-${entry.timestamp}-${index}`}
                      style={[
                        styles.historyItem,
                        { backgroundColor: colors.card },
                        selectedEntry === entry && {
                          backgroundColor: colors.primary + '20',
                        },
                      ]}
                      onPress={() => handleEntryPress(entry)}
                      onLongPress={() => setSelectedEntry(entry)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.historyItemContent}>
                        <View style={styles.historyItemHeader}>
                          <View style={styles.titleContainer}>
                            <Ionicons
                              name={getContextIcon(entry.context)}
                              size={16}
                              color={colors.primary}
                              style={styles.contextIcon}
                            />
                            <Text
                              style={[
                                styles.historyItemTitle,
                                { color: colors.text },
                              ]}
                              numberOfLines={1}
                            >
                              {entry.title}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.timestamp,
                              { color: colors.tabIconDefault },
                            ]}
                          >
                            {formatTimestamp(entry.timestamp)}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.historyItemPath,
                            { color: colors.tabIconDefault },
                          ]}
                          numberOfLines={1}
                        >
                          {entry.path}
                        </Text>

                        {entry.metadata?.mangaId && (
                          <View style={styles.metadata}>
                            <Text
                              style={[
                                styles.metadataText,
                                { color: colors.tabIconDefault },
                              ]}
                            >
                              Manga ID: {entry.metadata.mangaId}
                            </Text>
                            {entry.metadata.chapterNumber && (
                              <Text
                                style={[
                                  styles.metadataText,
                                  { color: colors.tabIconDefault },
                                ]}
                              >
                                • Chapter {entry.metadata.chapterNumber}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              {Object.keys(groupedHistory).length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="time"
                    size={48}
                    color={colors.tabIconDefault}
                  />
                  <Text
                    style={[styles.emptyText, { color: colors.tabIconDefault }]}
                  >
                    No navigation history yet
                  </Text>
                </View>
              )}
            </ScrollView>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: screenHeight * 0.7,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  blurContainer: {
    flex: 1,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(128, 128, 128, 0.5)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  dateGroup: {
    marginBottom: 24,
  },
  dateHeader: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyItem: {
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  historyItemContent: {
    padding: 16,
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  contextIcon: {
    marginRight: 8,
  },
  historyItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    fontWeight: '400',
  },
  historyItemPath: {
    fontSize: 14,
    marginBottom: 4,
  },
  metadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metadataText: {
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});

export default NavigationHistoryPanel;
