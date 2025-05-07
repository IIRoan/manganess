import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface ChapterGuideOverlayProps {
  visible: boolean;
  onDismiss: () => void;
  colors: any;
  onStepChange: (step: number) => void;
  hideControls?: () => void;
  showControls?: () => void;
}

const GUIDE_STORAGE_KEY = "chapter_guide_seen";
const { width, height } = Dimensions.get("window");

export const ChapterGuideOverlay: React.FC<ChapterGuideOverlayProps> = ({
  visible,
  onDismiss,
  colors,
  onStepChange,
  hideControls,
  showControls,
}) => {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, opacity]);

  useEffect(() => {
    onStepChange(currentStep);
  }, [currentStep, onStepChange]);

  const handleNext = () => {
    if (currentStep === 1 && hideControls) {
      hideControls();
    }

    if (currentStep < totalSteps) {
      setCurrentStep((prevStep) => prevStep + 1);
    } else {
      handleDismiss();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      const newStep = currentStep - 1;
      setCurrentStep(newStep);

      // If going back to step 1, show the navigation controls
      if (newStep === 1 && showControls) {
        showControls();
      }
    }
  };

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(GUIDE_STORAGE_KEY, "true");
    } catch (error) {
      console.error("Error saving guide state:", error);
    }
    onDismiss();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <>
            <View style={styles.guideOverlay} pointerEvents="none">
              <View style={[styles.navHighlight, { top: insets.top }]} />
            </View>
            <View
              style={[styles.guideContent, { marginTop: insets.top + 100 }]}
            >
              <Text style={[styles.guideTitle, { color: colors.primary }]}>
                Navigation Controls
              </Text>
              <Text style={[styles.guideExplanation, { color: colors.text }]}>
                Try using the controls at the top:
              </Text>
              <View style={styles.guideRow}>
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: colors.primary + "20" },
                  ]}
                >
                  <Ionicons
                    name="arrow-back"
                    size={24}
                    color={colors.primary}
                  />
                </View>
                <Text style={[styles.guideText, { color: colors.text }]}>
                  Return to details page
                </Text>
              </View>
              <View style={styles.guideRow}>
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: colors.primary + "20" },
                  ]}
                >
                  <Ionicons name="menu" size={24} color={colors.primary} />
                </View>
                <Text style={[styles.guideText, { color: colors.text }]}>
                  Tap title area to browse all chapters
                </Text>
              </View>
              <View style={styles.guideRow}>
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: colors.primary + "20" },
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={24}
                    color={colors.primary}
                  />
                </View>
                <Text style={[styles.guideText, { color: colors.text }]}>
                  Navigate between chapters
                </Text>
              </View>
              <Text style={[styles.guideNote, { color: colors.text + "80" }]}>
                Works for both manga and manhwa
              </Text>
            </View>
          </>
        );
      case 2:
        return (
          <>
            <View style={styles.fullOverlay} pointerEvents="none" />
            <View style={styles.centerContentWrapper}>
              <View style={styles.mainTapArea} pointerEvents="none" />
              <View style={styles.guideContent}>
                <Text style={[styles.guideTitle, { color: colors.primary }]}>
                  Interactive Area
                </Text>
                <View style={styles.guideRow}>
                  <View
                    style={[
                      styles.iconBubble,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <Ionicons
                      name="hand-left-outline"
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={[styles.guideText, { color: colors.text }]}>
                    Tapping most of the screen will show/hide navigation
                    controls
                  </Text>
                </View>
                <Text style={[styles.guideNote, { color: colors.text + "80" }]}>
                  Great for manga and manhwa reading - tap to toggle controls
                  when needed
                </Text>
              </View>
            </View>
          </>
        );
      case 3:
        return (
          <>
            <View style={styles.fullOverlay} pointerEvents="none" />
            <View style={styles.centerContentWrapper}>
              <View style={styles.edgeTapAreas} pointerEvents="none">
                <View style={styles.leftEdge} />
                <View style={styles.rightEdge} />
              </View>
              <View style={styles.guideContent}>
                <Text style={[styles.guideTitle, { color: colors.primary }]}>
                  Safe Scroll Zones
                </Text>
                <View style={styles.guideRow}>
                  <View
                    style={[
                      styles.iconBubble,
                      { backgroundColor: colors.primary + "20" },
                    ]}
                  >
                    <Ionicons
                      name="finger-print-outline"
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={[styles.guideText, { color: colors.text }]}>
                    The edge areas (60px wide) let you scroll without triggering
                    controls
                  </Text>
                </View>
                <Text style={[styles.guideNote, { color: colors.text + "80" }]}>
                  Perfect for long manga and manhwa chapters
                </Text>
              </View>
            </View>
          </>
        );
      case 4:
        return (
          <>
            <View style={styles.fullOverlay} pointerEvents="none" />
            <View style={styles.centerContentWrapper}>
              <View style={styles.guideContent}>
                <Text style={[styles.guideTitle, { color: colors.primary }]}>
                  Ready to Read!
                </Text>
                <View style={styles.finalStep}>
                  <Ionicons
                    name="book-outline"
                    size={48}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.guideText,
                      {
                        color: colors.text,
                        textAlign: "center",
                        marginTop: 16,
                      },
                    ]}
                  >
                    Enjoy reading your manga and manhwa with these intuitive
                    controls
                  </Text>
                  <Text
                    style={[
                      styles.guideNote,
                      {
                        color: colors.text + "80",
                        textAlign: "center",
                        marginTop: 8,
                      },
                    ]}
                  >
                    This guide won't appear again, but you can reset it in the
                    Debug menu
                  </Text>
                </View>
              </View>
            </View>
          </>
        );
      default:
        return null;
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        { opacity, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      pointerEvents={currentStep === 1 ? "box-none" : "auto"}
    >
      {renderStep()}

      <View style={styles.controlRow}>
        <View style={styles.navButtons}>
          {currentStep > 1 && (
            <TouchableOpacity
              style={[styles.backButton, { borderColor: colors.primary }]}
              onPress={handleBack}
              activeOpacity={0.7}
              testID="guide-back-button"
            >
              <Ionicons
                name="arrow-back"
                size={16}
                color={colors.primary}
                style={styles.backIcon}
              />
              <Text style={[styles.backButtonText, { color: colors.primary }]}>
                Back
              </Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.stepIndicator, { color: colors.text }]}>
            {currentStep}/{totalSteps}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: colors.primary }]}
          onPress={handleNext}
          activeOpacity={0.7}
          testID="guide-next-button"
        >
          <Text style={styles.nextButtonText}>
            {currentStep < totalSteps ? "Next" : "Finish"}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={16}
            color="white"
            style={styles.nextIcon}
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// Helper to check if the user has seen the guide before
export const hasSeenChapterGuide = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(GUIDE_STORAGE_KEY);
    return value === "true";
  } catch (error) {
    console.error("Error checking guide state:", error);
    return false;
  }
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "space-between",
    zIndex: 100,
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  guideOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  navHighlight: {
    height: 56,
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    position: "absolute",
  },
  centerContentWrapper: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  mainTapArea: {
    position: "absolute",
    top: 0,
    left: 60, // 60px from left
    right: 60, // 60px from right
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderStyle: "dashed",
  },
  edgeTapAreas: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  leftEdge: {
    width: 60, // 60px exactly
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRightWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderStyle: "dashed",
  },
  rightEdge: {
    width: 60, // 60px exactly
    height: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderLeftWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    borderStyle: "dashed",
  },
  guideContent: {
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 16,
    margin: 16,
    alignSelf: "center",
    maxWidth: 400,
    width: "90%",
    zIndex: 5,
  },
  guideTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  guideExplanation: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: "center",
  },
  guideRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  guideText: {
    fontSize: 16,
    flex: 1,
  },
  guideNote: {
    fontSize: 14,
    marginTop: 8,
    fontStyle: "italic",
  },
  finalStep: {
    alignItems: "center",
    paddingVertical: 20,
  },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingBottom: 32,
    zIndex: 2,
  },
  navButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepIndicator: {
    fontSize: 16,
    fontWeight: "bold",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  backIcon: {
    marginRight: 6,
  },
  nextButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  nextButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  nextIcon: {
    marginLeft: 8,
  },
});
