export interface NavigationEntry {
  path: string;
  timestamp: number;
  title?: string;
}

export interface NavigationState {
  contextHistory: NavigationEntry[];
  currentDepth: number;
}

export interface NavigationHistory {
  entries: NavigationEntry[];
  currentIndex: number;
}

export interface NavigationContext {
  type: 'manga' | 'chapter' | 'search' | 'home' | 'bookmarks' | 'settings';
  id?: string;
  title?: string;
}

export type NavigationContextType = NavigationContext['type'];

export interface NavigationSettings {
  maxHistorySize: number;
  enableBreadcrumbs: boolean;
  showBackButton: boolean;
}

export interface BreadcrumbItem {
  label: string;
  path: string;
  icon?: string;
}

export interface NavigationAnalytics {
  totalNavigations: number;
  averageSessionLength: number;
  mostVisitedPaths: Record<string, number>;
}

export interface LegacyNavigationHistory {
  history: string[];
  currentIndex: number;
}

export interface NavigationGestureConfig {
  threshold: number;
  velocity: number;
  enabled: boolean;
  sensitivity: number;
  distanceThreshold: number;
  edgeThreshold: number;
  velocityThreshold: number;
}
