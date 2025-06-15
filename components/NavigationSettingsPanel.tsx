import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { NavigationSettings, NavigationAnalytics } from '@/types/navigation';

interface NavigationSettingsPanelProps {
  style?: any;
}

const NavigationSettingsPanel: React.FC<NavigationSettingsPanelProps> = ({ style }) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const { settings, updateSettings, getAnalytics, clearHistory } = useNavigationHistory();
  const [analytics, setAnalytics] = useState<NavigationAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const colors = Colors[colorScheme];

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const analyticsData = await getAnalytics();
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingChange = async (key: keyof NavigationSettings, value: any) => {
    try {
      await updateSettings({ [key]: value });
    } catch (error) {
      console.error('Error updating setting:', error);
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Navigation History',
      'This will permanently delete all your navigation history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearHistory();
              await loadAnalytics(); // Refresh analytics
            } catch (error) {
              console.error('Error clearing history:', error);
            }
          },
        },
      ]
    );
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  if (!settings) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }, style]}>
        <Text style={[styles.title, { color: colors.text }]}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.card }, style]}>
      <Text style={[styles.title, { color: colors.text }]}>Navigation Settings</Text>

      {/* Gesture Settings */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Gestures</Text>
        
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View style={styles.settingContent}>
            <Ionicons name="hand-left" size={20} color={colors.primary} style={styles.settingIcon} />
            <View style={styles.settingText}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Enable Swipe Back</Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Swipe from the left edge to go back
              </Text>
            </View>
          </View>
          <Switch
            value={settings.enableGestures}
            onValueChange={(value) => handleSettingChange('enableGestures', value)}
            trackColor={{ false: colors.border, true: colors.primary + '40' }}
            thumbColor={settings.enableGestures ? colors.primary : colors.textSecondary}
          />
        </View>

        {settings.enableGestures && (
          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <View style={styles.settingContent}>
              <Ionicons name="speedometer" size={20} color={colors.primary} style={styles.settingIcon} />
              <View style={styles.settingTextFull}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  Swipe Sensitivity: {Math.round(settings.swipeSensitivity * 100)}%
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  How easily swipe gestures are triggered
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0.1}
                  maximumValue={1.0}
                  value={settings.swipeSensitivity}
                  onValueChange={(value) => handleSettingChange('swipeSensitivity', value)}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.primary}
                />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Visual Settings */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Visual Elements</Text>
        
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View style={styles.settingContent}>
            <Ionicons name="trail-sign" size={20} color={colors.primary} style={styles.settingIcon} />
            <View style={styles.settingText}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Show Breadcrumbs</Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Display navigation path at the top
              </Text>
            </View>
          </View>
          <Switch
            value={settings.showBreadcrumbs}
            onValueChange={(value) => handleSettingChange('showBreadcrumbs', value)}
            trackColor={{ false: colors.border, true: colors.primary + '40' }}
            thumbColor={settings.showBreadcrumbs ? colors.primary : colors.textSecondary}
          />
        </View>

        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View style={styles.settingContent}>
            <Ionicons name="bulb" size={20} color={colors.primary} style={styles.settingIcon} />
            <View style={styles.settingText}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Smart Suggestions</Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Show personalized navigation suggestions
              </Text>
            </View>
          </View>
          <Switch
            value={settings.enableSmartSuggestions}
            onValueChange={(value) => handleSettingChange('enableSmartSuggestions', value)}
            trackColor={{ false: colors.border, true: colors.primary + '40' }}
            thumbColor={settings.enableSmartSuggestions ? colors.primary : colors.textSecondary}
          />
        </View>

        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View style={styles.settingContent}>
            <Ionicons name="layers" size={20} color={colors.primary} style={styles.settingIcon} />
            <View style={styles.settingText}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Context Separation</Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Keep reading and browsing history separate
              </Text>
            </View>
          </View>
          <Switch
            value={settings.contextSeparation}
            onValueChange={(value) => handleSettingChange('contextSeparation', value)}
            trackColor={{ false: colors.border, true: colors.primary + '40' }}
            thumbColor={settings.contextSeparation ? colors.primary : colors.textSecondary}
          />
        </View>
      </View>

      {/* History Settings */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>History Management</Text>
        
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <View style={styles.settingContent}>
            <Ionicons name="archive" size={20} color={colors.primary} style={styles.settingIcon} />
            <View style={styles.settingTextFull}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                Max History Size: {settings.maxHistorySize}
              </Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Maximum number of pages to remember per context
              </Text>
              <Slider
                style={styles.slider}
                minimumValue={10}
                maximumValue={100}
                step={5}
                value={settings.maxHistorySize}
                onValueChange={(value) => handleSettingChange('maxHistorySize', Math.round(value))}
                minimumTrackTintColor={colors.primary}
                maximumTrackTintColor={colors.border}
                thumbTintColor={colors.primary}
              />
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.settingRow, styles.dangerButton, { borderBottomColor: colors.border }]}
          onPress={handleClearHistory}
        >
          <View style={styles.settingContent}>
            <Ionicons name="trash" size={20} color="#FF6B6B" style={styles.settingIcon} />
            <View style={styles.settingText}>
              <Text style={[styles.settingLabel, { color: '#FF6B6B' }]}>Clear All History</Text>
              <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                Permanently delete navigation history
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      {/* Analytics */}
      {analytics && !isLoading && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Usage Statistics</Text>
          
          <View style={[styles.analyticsGrid, { backgroundColor: colors.background }]}>
            <View style={styles.analyticsItem}>
              <Text style={[styles.analyticsValue, { color: colors.primary }]}>
                {formatNumber(analytics.totalNavigations)}
              </Text>
              <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>
                Total Navigations
              </Text>
            </View>
            
            <View style={styles.analyticsItem}>
              <Text style={[styles.analyticsValue, { color: colors.primary }]}>
                {formatTime(analytics.averageSessionLength)}
              </Text>
              <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>
                Avg Session
              </Text>
            </View>
            
            <View style={styles.analyticsItem}>
              <Text style={[styles.analyticsValue, { color: colors.primary }]}>
                {formatNumber(analytics.gestureUsageStats.swipeBack)}
              </Text>
              <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>
                Swipe Backs
              </Text>
            </View>
            
            <View style={styles.analyticsItem}>
              <Text style={[styles.analyticsValue, { color: colors.primary }]}>
                {formatNumber(analytics.gestureUsageStats.breadcrumbUsage)}
              </Text>
              <Text style={[styles.analyticsLabel, { color: colors.textSecondary }]}>
                Breadcrumb Taps
              </Text>
            </View>
          </View>

          {Object.keys(analytics.mostVisitedPaths).length > 0 && (
            <View style={styles.topPagesContainer}>
              <Text style={[styles.subsectionTitle, { color: colors.text }]}>Most Visited Pages</Text>
              {Object.entries(analytics.mostVisitedPaths)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([path, visits], index) => (
                  <View key={path} style={[styles.topPageItem, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.topPagePath, { color: colors.text }]} numberOfLines={1}>
                      {path}
                    </Text>
                    <Text style={[styles.topPageVisits, { color: colors.textSecondary }]}>
                      {visits} visits
                    </Text>
                  </View>
                ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingText: {
    flex: 1,
    marginRight: 16,
  },
  settingTextFull: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  slider: {
    width: '100%',
    height: 40,
    marginTop: 8,
  },
  dangerButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 8,
    marginVertical: 8,
    paddingHorizontal: 12,
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  analyticsItem: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: 12,
  },
  analyticsValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  analyticsLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  topPagesContainer: {
    marginTop: 8,
  },
  topPageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  topPagePath: {
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  topPageVisits: {
    fontSize: 12,
  },
});

export default NavigationSettingsPanel;