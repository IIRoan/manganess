import type React from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { Ionicons } from "@expo/vector-icons"

interface LastReadChapterBarProps {
  lastReadChapter: string | null
  onPress: () => void
  colors: any
  readChapters: string[]
}

const LastReadChapterBar: React.FC<LastReadChapterBarProps> = ({ lastReadChapter, onPress, colors }) => {
  const isStartReading = !lastReadChapter || lastReadChapter === "Not started"

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: colors.primary + "08",
          borderColor: colors.primary + "10",
        },
      ]}
      testID="last-read-chapter-bar"
    >
      <View style={[styles.content]}>
        <Ionicons
          name={isStartReading ? "play-circle-outline" : "bookmark-outline"}
          size={20}
          color={colors.primary}
          style={styles.icon}
        />
        <Text style={[styles.text, { color: colors.text }]}>
          {isStartReading ? (
            "Start reading"
          ) : (
            <>
              Continue from <Text style={[styles.chapterText, { color: colors.primary }]}>{lastReadChapter}</Text>
            </>
          )}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text + "40"} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    marginTop: 20,
    marginBottom: -20,
    padding: 14,
    borderWidth: 1,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  icon: {
    marginRight: 12,
  },
  text: {
    fontSize: 15,
    fontWeight: "400",
    letterSpacing: 0.1,
  },
  chapterText: {
    fontWeight: "600",
  },
})

export default LastReadChapterBar

