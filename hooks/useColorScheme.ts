import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { ColorScheme } from '@/constants/Colors';

export function useColorScheme(): ColorScheme {
  return useDeviceColorScheme() as ColorScheme;
}
