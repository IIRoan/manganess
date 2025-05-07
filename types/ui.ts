// Contains all UI component types

import { ColorScheme } from '@/constants/Colors';
import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { TextStyle, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { ThemeType } from './';

// Define a comprehensive type for all icon names based on Ionicons
export type IconName = keyof typeof Ionicons.glyphMap;

// Make sure Option and AlertOption are consistent
export interface Option {
  text: string;
  onPress: () => void;
  icon?: IconName;
}

export interface AlertOption {
  text: string;
  onPress: () => void;
  icon?: IconName;
}

export interface AlertConfig {
  type: string;
  title: string;
  message: string;
  options: AlertOption[];
}

export interface ThemeOption {
  label: string;
  value: ThemeType;
  icon: string;
}

export interface ExpandableTextProps {
  text: string;
  initialLines?: number;
  style?: TextStyle;
  expandedStyle?: TextStyle;
}

export interface LastReadChapterBarProps {
  lastReadChapter: string | null;
  onPress: () => void;
  colors: any;
  readChapters: string[];
}

export interface MangaCardProps {
  title: string;
  imageUrl: string;
  onPress: () => void;
  lastReadChapter: string | null;
  style?: ViewStyle;
}

export interface NessieAnimationProps {
  style?: ViewStyle;
  imageSize?: number;
}

export interface GenreTagProps {
  genre: string;
}

export interface CustomWebViewProps extends React.ComponentProps<typeof WebView> {
  allowedHosts?: string[];
  currentUrl?: string;
}

export interface SwipeableChapterItemProps {
  chapter: {
    number: string;
    title: string;
    date: string;
  };
  isRead: boolean;
  isLastItem: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onUnread: () => void;
  colors: any;
  styles: any;
  currentlyOpenSwipeable: Swipeable | null;
  setCurrentlyOpenSwipeable: (swipeable: Swipeable | null) => void;
}

export interface CustomAlertProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  type: 'bookmarks' | 'confirm';
  options?: Option[];
  message?: string;
}

export interface BottomPopupProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  options?: Option[];
}