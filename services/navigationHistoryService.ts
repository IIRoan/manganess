import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NavigationHistory,
  NavigationContext,
  NavigationEntry,
  NavigationContextType,
  NavigationSettings,
  NavigationState,
  BreadcrumbItem,
  NavigationAnalytics,
  LegacyNavigationHistory,
} from '../types/navigation';

const HISTORY_KEY = 'navigation_history_v2';
const LEGACY_HISTORY_KEY = 'navigation_history';
const ANALYTICS_KEY = 'navigation_analytics';
const SETTINGS_KEY = 'navigation_settings';

const DEFAULT_SETTINGS: NavigationSettings = {
  maxHistorySize: 50,
  enableGestures: true,
  swipeSensitivity: 0.5,
  showBreadcrumbs: false,
  enableSmartSuggestions: true,
  contextSeparation: false,
};

const DEFAULT_ROUTE = '/mangasearch';

class NavigationHistoryService {
  private static instance: NavigationHistoryService;
  private history: NavigationHistory | null = null;
  private analytics: NavigationAnalytics | null = null;
  private _settings: NavigationSettings = DEFAULT_SETTINGS;
  private sessionId: string = '';
  private saveQueue: (() => Promise<void>)[] = [];
  private isProcessingSaveQueue = false;
  private performanceMetrics = {
    addToHistoryTime: 0,
    getPreviousRouteTime: 0,
    getNavigationStateTime: 0,
    totalOperations: 0,
  };

  private constructor() {
    this.generateSessionId();
  }

  static getInstance(): NavigationHistoryService {
    if (!NavigationHistoryService.instance) {
      NavigationHistoryService.instance = new NavigationHistoryService();
    }
    return NavigationHistoryService.instance;
  }

  private generateSessionId(): void {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async initializeHistory(): Promise<NavigationHistory> {
    try {
      const historyData = await AsyncStorage.getItem(HISTORY_KEY);

      if (historyData) {
        const parsed: NavigationHistory = JSON.parse(historyData);
        // Validate version and migrate if needed
        if (parsed.version !== 2) {
          return await this.migrateFromLegacy();
        }
        return parsed;
      }

      // Check for legacy history to migrate
      const legacyData = await AsyncStorage.getItem(LEGACY_HISTORY_KEY);
      if (legacyData) {
        return await this.migrateFromLegacy();
      }

      // Create new history
      return this.createNewHistory();
    } catch (error) {
      console.error('Error initializing history:', error);
      return this.createNewHistory();
    }
  }

  private async migrateFromLegacy(): Promise<NavigationHistory> {
    try {
      const legacyData = await AsyncStorage.getItem(LEGACY_HISTORY_KEY);
      const newHistory = this.createNewHistory();

      if (legacyData) {
        const legacy: LegacyNavigationHistory = JSON.parse(legacyData);
        const browseContext = this.createContext('browse');

        // Migrate legacy paths to new structure
        legacy.paths.forEach((path, index) => {
          const entry: NavigationEntry = {
            path,
            title: this.getPageTitle(path),
            timestamp:
              legacy.lastUpdated - (legacy.paths.length - index) * 1000,
            context: this.determineContext(path),
            metadata: this.extractMetadata(path),
          };
          browseContext.stack.push(entry);
          newHistory.globalStack.push(entry);
        });

        newHistory.contexts.browse = browseContext;
        newHistory.currentContext = 'browse';
      }

      await this.saveHistory(newHistory);
      return newHistory;
    } catch (error) {
      console.error('Error migrating from legacy:', error);
      return this.createNewHistory();
    }
  }

  private createNewHistory(): NavigationHistory {
    return {
      contexts: {},
      globalStack: [],
      currentContext: 'browse',
      settings: { ...DEFAULT_SETTINGS },
      lastUpdated: Date.now(),
      version: 2,
    };
  }

  private createContext(type: NavigationContextType): NavigationContext {
    return {
      id: `${type}_${Date.now()}`,
      type,
      stack: [],
      metadata: {
        lastAccessed: Date.now(),
        sessionId: this.sessionId,
        totalVisits: 0,
        averageTimeSpent: 0,
      },
    };
  }

  private determineContext(path: string): NavigationContextType {
    if (path.includes('/manga/') && path.includes('/chapter/')) {
      return 'reading';
    }
    if (path === '/mangasearch') {
      return 'search';
    }
    if (path === '/settings') {
      return 'settings';
    }
    return 'browse';
  }

  private extractMetadata(path: string): NavigationEntry['metadata'] {
    const metadata: NavigationEntry['metadata'] = {};

    // Extract manga ID from path
    const mangaMatch = path.match(/\/manga\/([^\/]+)/);
    if (mangaMatch?.[1]) {
      metadata.mangaId = mangaMatch[1];
    }

    // Extract chapter number
    const chapterMatch = path.match(/\/chapter\/([^\/]+)/);
    if (chapterMatch) {
      metadata.chapterNumber = parseInt(chapterMatch?.[1] || '0', 10);
    }

    // Extract search query (if present in path)
    const searchMatch = path.match(/[?&]q=([^&]+)/);
    if (searchMatch) {
      metadata.searchQuery = decodeURIComponent(searchMatch?.[1] || '');
    }

    return metadata;
  }

  private getPageTitle(path: string): string {
    const titleMap: Record<string, string> = {
      '/': 'Home',
      '/mangasearch': 'Search',
      '/bookmarks': 'Bookmarks',
      '/settings': 'Settings',
    };

    if (titleMap[path]) {
      return titleMap[path];
    }

    if (path.includes('/manga/') && path.includes('/chapter/')) {
      const chapterMatch = path.match(/\/chapter\/([^\/]+)/);
      return chapterMatch ? `Chapter ${chapterMatch[1]}` : 'Chapter';
    }

    if (path.includes('/manga/')) {
      return 'Manga Details';
    }

    return 'Page';
  }

  private async saveHistory(history: NavigationHistory): Promise<void> {
    return new Promise((resolve) => {
      const saveOperation = async () => {
        try {
          history.lastUpdated = Date.now();
          await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history));
          this.history = history;
          resolve();
        } catch (error) {
          console.error('Error saving history:', error);
          resolve(); // Still resolve to not block the queue
        }
      };

      this.saveQueue.push(saveOperation);
      this.processSaveQueue();
    });
  }

  private async processSaveQueue(): Promise<void> {
    if (this.isProcessingSaveQueue || this.saveQueue.length === 0) {
      return;
    }

    this.isProcessingSaveQueue = true;

    while (this.saveQueue.length > 0) {
      const operation = this.saveQueue.shift();
      if (operation) {
        await operation();
      }
    }

    this.isProcessingSaveQueue = false;
  }

  private measurePerformance<T>(
    operation: () => Promise<T> | T,
    metricKey: keyof typeof this.performanceMetrics
  ): Promise<T> | T {
    const start = Date.now();

    try {
      const result = operation();

      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = Date.now() - start;
          this.updatePerformanceMetric(metricKey, duration);
        });
      } else {
        const duration = Date.now() - start;
        this.updatePerformanceMetric(metricKey, duration);
        return result;
      }
    } catch (error) {
      const duration = Date.now() - start;
      this.updatePerformanceMetric(metricKey, duration);
      throw error;
    }
  }

  private updatePerformanceMetric(
    key: keyof typeof this.performanceMetrics,
    duration: number
  ): void {
    if (key === 'totalOperations') {
      this.performanceMetrics[key]++;
    } else {
      // Calculate running average
      const currentCount = this.performanceMetrics.totalOperations;
      const currentAvg =
        this.performanceMetrics[key as keyof typeof this.performanceMetrics];
      this.performanceMetrics[key as keyof typeof this.performanceMetrics] =
        (currentAvg * currentCount + duration) / (currentCount + 1);
    }
  }

  private async getHistory(): Promise<NavigationHistory> {
    if (!this.history) {
      this.history = await this.initializeHistory();
    }
    return this.history;
  }

  private pruneHistory(context: NavigationContext, maxSize: number): void {
    if (context.stack.length > maxSize) {
      const toRemove = context.stack.length - maxSize;
      context.stack.splice(0, toRemove);
    }
  }

  private updateAnalytics(entry: NavigationEntry): void {
    // Update analytics in background
    this.updateAnalyticsAsync(entry).catch(console.error);
  }

  private async updateAnalyticsAsync(entry: NavigationEntry): Promise<void> {
    try {
      let analytics = this.analytics;

      if (!analytics) {
        const analyticsData = await AsyncStorage.getItem(ANALYTICS_KEY);
        analytics = analyticsData
          ? JSON.parse(analyticsData)
          : {
              totalNavigations: 0,
              averageSessionLength: 0,
              mostVisitedPaths: {},
              navigationPatterns: [],
              gestureUsageStats: {
                swipeBack: 0,
                tapBack: 0,
                breadcrumbUsage: 0,
              },
            };
        this.analytics = analytics;
      }

      if (analytics) {
        analytics.totalNavigations++;
        analytics.mostVisitedPaths[entry.path] =
          (analytics.mostVisitedPaths[entry.path] || 0) + 1;

        // Update patterns (last 10 paths)
        analytics.navigationPatterns.push(entry.path);
        if (analytics.navigationPatterns.length > 10) {
          analytics.navigationPatterns.shift();
        }
      }

      await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
    } catch (error) {
      console.error('Error updating analytics:', error);
    }
  }

  async addToHistory(
    path: string,
    options: {
      title?: string;
      context?: NavigationContextType;
      metadata?: Partial<NavigationEntry['metadata']>;
    } = {}
  ): Promise<void> {
    return this.measurePerformance(async () => {
      try {
        const history = await this.getHistory();
        const contextType = options.context || this.determineContext(path);

        // Don't add if it's the same as the last entry in global stack
        const lastEntry = history.globalStack[history.globalStack.length - 1];
        if (lastEntry && lastEntry.path === path) {
          console.log('🔍 Navigation Debug - Skipping duplicate path:', path);
          return;
        }

        // NEVER store chapter routes in history - they should only be accessible via SwipeChapterItem
        if (path.includes('/manga/') && path.includes('/chapter/')) {
          console.log(
            '🚫 Navigation Debug - Skipping chapter route from history:',
            path
          );
          return;
        }

        console.log('🔍 Navigation Debug - Adding to history:', path);

        // Create navigation entry
        const entry: NavigationEntry = {
          path,
          title: options.title || this.getPageTitle(path),
          timestamp: Date.now(),
          context: contextType,
          metadata: {
            ...this.extractMetadata(path),
            ...options.metadata,
          },
        };

        // Add to global stack (primary navigation tracking)
        history.globalStack.push(entry);

        // Also maintain context stack for analytics
        let context = history.contexts[contextType];
        if (!context) {
          context = this.createContext(contextType);
          history.contexts[contextType] = context;
        }
        context.stack.push(entry);
        context.metadata.lastAccessed = Date.now();
        context.metadata.totalVisits++;
        history.currentContext = contextType;

        // Keep global stack manageable - this is the key for accurate navigation
        if (history.globalStack.length > history.settings.maxHistorySize) {
          history.globalStack.splice(
            0,
            history.globalStack.length - history.settings.maxHistorySize
          );
        }

        // Also prune context stacks
        this.pruneHistory(context, history.settings.maxHistorySize);

        await this.saveHistory(history);
        this.updateAnalytics(entry);
        this.updatePerformanceMetric('totalOperations', 0);
      } catch (error) {
        console.error('Error adding to history:', error);
      }
    }, 'addToHistoryTime');
  }

  async getPreviousRoute(currentPath: string): Promise<string> {
    return this.measurePerformance(async () => {
      try {
        const history = await this.getHistory();

        console.log('🔍 Navigation Debug - Current Path:', currentPath);
        console.log(
          '🔍 Navigation Debug - Global Stack:',
          history.globalStack.map((entry) => entry.path)
        );

        // Special handling for chapter pages - go back to manga detail
        if (
          currentPath.includes('/manga/') &&
          currentPath.includes('/chapter/')
        ) {
          const mangaMatch = currentPath.match(/\/manga\/([^\/]+)/);
          if (mangaMatch) {
            const previousRoute = `/manga/${mangaMatch[1]}`;
            console.log(
              '🔍 Navigation Debug - Chapter -> Manga:',
              previousRoute
            );
            return previousRoute;
          }
          return DEFAULT_ROUTE;
        }

        // Use global stack for simple, accurate navigation
        if (history.globalStack.length < 2) {
          console.log(
            '🔍 Navigation Debug - Insufficient history, using default'
          );
          return DEFAULT_ROUTE;
        }

        // Find the current path in the global stack (search from end)
        let currentIndex = -1;
        for (let i = history.globalStack.length - 1; i >= 0; i--) {
          if (history.globalStack[i]?.path === currentPath) {
            currentIndex = i;
            break;
          }
        }

        console.log('🔍 Navigation Debug - Current Index:', currentIndex);

        // If current path found and there's a previous entry
        if (currentIndex > 0) {
          const previousRoute = history.globalStack[currentIndex - 1]?.path;
          console.log('🔍 Navigation Debug - Found previous:', previousRoute);
          return previousRoute || DEFAULT_ROUTE;
        }

        // If current path not found or is first, return the last entry that's not current
        for (let i = history.globalStack.length - 1; i >= 0; i--) {
          if (history.globalStack[i]?.path !== currentPath) {
            const previousRoute = history.globalStack[i]?.path;
            console.log(
              '🔍 Navigation Debug - Using last different path:',
              previousRoute
            );
            return previousRoute || DEFAULT_ROUTE;
          }
        }

        console.log('🔍 Navigation Debug - Fallback to default');
        return DEFAULT_ROUTE;
      } catch (error) {
        console.error('Error getting previous route:', error);
        return DEFAULT_ROUTE;
      }
    }, 'getPreviousRouteTime');
  }


  private findPreviousContext(
    history: NavigationHistory,
    currentContextType: NavigationContextType
  ): NavigationContext | null {
    const contexts = Object.values(history.contexts);
    const sortedContexts = contexts
      .filter((ctx) => ctx.type !== currentContextType)
      .sort((a, b) => b.metadata.lastAccessed - a.metadata.lastAccessed);

    return sortedContexts[0] || null;
  }

  async getNavigationState(currentPath: string): Promise<NavigationState> {
    try {
      const history = await this.getHistory();
      const contextType = this.determineContext(currentPath);
      const context = history.contexts[contextType];

      const state: NavigationState = {
        canGoBack: false,
        canGoForward: false,
        currentDepth: 0,
        contextHistory: [],
        breadcrumbs: [],
        suggestions: [],
      };

      if (context) {
        const currentIndex = context.stack.findLastIndex(
          (entry) => entry.path === currentPath
        );
        state.canGoBack =
          currentIndex > 0 ||
          this.findPreviousContext(history, contextType) !== null;
        state.currentDepth = context.stack.length;
        state.contextHistory = context.stack.slice(-10); // Last 10 entries

        if (history.settings.showBreadcrumbs) {
          state.breadcrumbs = this.generateBreadcrumbs(currentPath, context);
        }

        if (history.settings.enableSmartSuggestions) {
          state.suggestions = await this.generateSuggestions(
            currentPath,
            history
          );
        }
      }

      return state;
    } catch (error) {
      console.error('Error getting navigation state:', error);
      return {
        canGoBack: false,
        canGoForward: false,
        currentDepth: 0,
        contextHistory: [],
        breadcrumbs: [],
        suggestions: [],
      };
    }
  }

  private generateBreadcrumbs(
    currentPath: string,
    _context: NavigationContext
  ): BreadcrumbItem[] {
    const breadcrumbs: BreadcrumbItem[] = [];

    // Add home breadcrumb
    breadcrumbs.push({
      path: '/',
      title: 'Home',
      icon: 'home',
      isClickable: true,
    });

    // Add context-specific breadcrumbs
    if (currentPath.includes('/manga/')) {
      breadcrumbs.push({
        path: '/mangasearch',
        title: 'Search',
        icon: 'search',
        isClickable: true,
      });

      if (currentPath.includes('/chapter/')) {
        const mangaMatch = currentPath.match(/\/manga\/([^\/]+)/);
        if (mangaMatch) {
          breadcrumbs.push({
            path: `/manga/${mangaMatch[1]}`,
            title: 'Manga Details',
            icon: 'book',
            isClickable: true,
          });
        }

        const chapterMatch = currentPath.match(/\/chapter\/([^\/]+)/);
        if (chapterMatch) {
          breadcrumbs.push({
            path: currentPath,
            title: `Chapter ${chapterMatch[1]}`,
            icon: 'bookmark',
            isClickable: false,
          });
        }
      }
    }

    return breadcrumbs;
  }

  private async generateSuggestions(
    currentPath: string,
    _history: NavigationHistory
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Add frequently visited pages
    if (this.analytics) {
      const sorted = Object.entries(this.analytics.mostVisitedPaths)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([path]) => path)
        .filter((path) => path !== currentPath);

      suggestions.push(...sorted);
    }

    // Add context-specific suggestions
    const contextType = this.determineContext(currentPath);
    if (contextType === 'reading' && currentPath.includes('/manga/')) {
      suggestions.push('/bookmarks');
    }

    return suggestions.slice(0, 3);
  }

  async clearHistory(): Promise<void> {
    try {
      const newHistory = this.createNewHistory();
      await this.saveHistory(newHistory);
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }

  async getSettings(): Promise<NavigationSettings> {
    try {
      const settingsData = await AsyncStorage.getItem(SETTINGS_KEY);
      if (settingsData) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(settingsData) };
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Error getting settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  async updateSettings(settings: Partial<NavigationSettings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = { ...currentSettings, ...settings };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      this._settings = newSettings;

      // Update history settings
      const history = await this.getHistory();
      history.settings = newSettings;
      await this.saveHistory(history);
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  }

  async getAnalytics(): Promise<NavigationAnalytics> {
    try {
      const analyticsData = await AsyncStorage.getItem(ANALYTICS_KEY);
      if (analyticsData) {
        return JSON.parse(analyticsData);
      }
      return {
        totalNavigations: 0,
        averageSessionLength: 0,
        mostVisitedPaths: {},
        navigationPatterns: [],
        gestureUsageStats: {
          swipeBack: 0,
          tapBack: 0,
          breadcrumbUsage: 0,
        },
      };
    } catch (error) {
      console.error('Error getting analytics:', error);
      return {
        totalNavigations: 0,
        averageSessionLength: 0,
        mostVisitedPaths: {},
        navigationPatterns: [],
        gestureUsageStats: {
          swipeBack: 0,
          tapBack: 0,
          breadcrumbUsage: 0,
        },
      };
    }
  }

  async recordGestureUsage(
    gestureType: 'swipeBack' | 'tapBack' | 'breadcrumbUsage'
  ): Promise<void> {
    try {
      const analytics = await this.getAnalytics();
      analytics.gestureUsageStats[gestureType]++;
      await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
      this.analytics = analytics;
    } catch (error) {
      console.error('Error recording gesture usage:', error);
    }
  }

  getPerformanceMetrics(): typeof this.performanceMetrics {
    return { ...this.performanceMetrics };
  }

  async optimizePerformance(): Promise<void> {
    try {
      const history = await this.getHistory();

      // Clean up old entries beyond reasonable limits
      const maxGlobalSize = history.settings.maxHistorySize * 3;
      if (history.globalStack.length > maxGlobalSize) {
        history.globalStack.splice(
          0,
          history.globalStack.length - maxGlobalSize
        );
      }

      // Clean up contexts with no recent activity
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      Object.keys(history.contexts).forEach((contextType) => {
        const context = history.contexts[contextType];
        if (
          (context?.metadata.lastAccessed || 0) < oneWeekAgo &&
          context?.stack.length === 0
        ) {
          delete history.contexts[contextType];
        }
      });

      await this.saveHistory(history);
    } catch (error) {
      console.error('Error optimizing performance:', error);
    }
  }
}

// Export singleton instance and legacy-compatible functions
const navigationService = NavigationHistoryService.getInstance();

export default navigationService;

// Legacy-compatible exports
export const getNavigationHistory = async (): Promise<string[]> => {
  const history = await navigationService.getNavigationState('/');
  return history.contextHistory.map((entry) => entry.path);
};

export const updateNavigationHistory = async (
  newPath: string
): Promise<void> => {
  await navigationService.addToHistory(newPath);
};

export const getPreviousRoute = async (
  currentPath: string
): Promise<string> => {
  return await navigationService.getPreviousRoute(currentPath);
};
