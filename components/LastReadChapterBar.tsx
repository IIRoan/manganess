import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LastReadChapterBarProps {
  lastReadChapter: string | null;
  onPress: () => void;
  colors: any;
  readChapters: string[];
}
const LastReadChapterBar: React.FC<LastReadChapterBarProps> = ({ 
  lastReadChapter, 
  onPress, 
  colors 
}) => {
  const isStartReading = !lastReadChapter || lastReadChapter === 'Not started';

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={[styles.container, { backgroundColor: colors.background }]}
      testID="last-read-chapter-bar"
    >
      <View style={styles.content}>
        <Ionicons 
          name={isStartReading ? "play-circle-outline" : "bookmark"} 
          size={20} 
          color={colors.primary} 
        />
        <Text style={[styles.text, { color: colors.text }]}>
          {isStartReading ? (
            "Start reading"
          ) : (
            <>
              Continue from <Text style={[styles.chapterText, { color: colors.primary }]}>
                {lastReadChapter}
              </Text>
            </>
          )}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.primary} />
    </TouchableOpacity>
  );
};


const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    marginTop: 20,
    marginBottom: -20,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    marginLeft: 10,
    fontSize: 14,
  },
  chapterText: {
    fontWeight: 'bold',
  },
});

export default LastReadChapterBar;
