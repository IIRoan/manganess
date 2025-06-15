// Contains all navigation-related types

export type NavigationContextType = 'browse' | 'reading' | 'settings' | 'search';

export interface NavigationEntry {
  path: string;
  title: string;
  timestamp: number;
  context: NavigationContextType;
  metadata: {
    mangaId?: string;
    chapterNumber?: number;
    searchQuery?: string;
    scrollPosition?: number;
    pageTitle?: string;
    previousPath?: string;
  };
}

export interface NavigationContext {
  id: string;
  type: NavigationContextType;
  stack: NavigationEntry[];
  metadata: {
    lastAccessed: number;
    sessionId: string;
    totalVisits: number;
    averageTimeSpent: number;
  };
}

export interface NavigationHistory {
  contexts: Record<string, NavigationContext>;
  globalStack: NavigationEntry[];
  currentContext: string;
  settings: NavigationSettings;
  lastUpdated: number;
  version: number;
}

export interface NavigationSettings {
  maxHistorySize: number;
  enableGestures: boolean;
  swipeSensitivity: number;
  showBreadcrumbs: boolean;
  enableSmartSuggestions: boolean;
  contextSeparation: boolean;
}

export interface NavigationGestureConfig {
  enabled: boolean;
  sensitivity: number;
  edgeThreshold: number;
  velocityThreshold: number;
  distanceThreshold: number;
}

export interface NavigationAnalytics {
  totalNavigations: number;
  averageSessionLength: number;
  mostVisitedPaths: Record<string, number>;
  navigationPatterns: string[];
  gestureUsageStats: {
    swipeBack: number;
    tapBack: number;
    breadcrumbUsage: number;
  };
}

export interface BreadcrumbItem {
  path: string;
  title: string;
  icon?: string;
  isClickable: boolean;
}

export interface NavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  currentDepth: number;
  contextHistory: NavigationEntry[];
  breadcrumbs: BreadcrumbItem[];
  suggestions: string[];
}

// Legacy interface for backward compatibility
export interface LegacyNavigationHistory {
  paths: string[];
  lastUpdated: number;
}
