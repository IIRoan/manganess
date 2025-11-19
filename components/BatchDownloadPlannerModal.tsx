import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, type ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import type { Chapter } from '@/types';
import {
  filterChaptersInRange,
  filterChaptersUpTo,
  parseChapterNumber,
  sortChaptersByNumber,
} from '@/utils/chapterOrdering';

type PlannerMode = 'all' | 'upto' | 'range';
type PlannerTab = 'download' | 'manage';
type SortOption = 'number-asc' | 'number-desc' | 'size-asc' | 'size-desc';
type ModeOption = {
  value: PlannerMode;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

interface BatchDownloadPlannerModalProps {
  visible: boolean;
  onClose: () => void;
  chapters: Chapter[];
  downloadedChapters: Chapter[];
  onDownloadConfirm: (chapters: Chapter[], description: string) => void;
  onDeleteConfirm: (chapters: Chapter[]) => void;
  initialTab?: PlannerTab;
  isProcessing?: boolean;
}

const sanitizeNumberInput = (value: string): string =>
  value.replace(/[^0-9.]/g, '');

const BatchDownloadPlannerModal: React.FC<BatchDownloadPlannerModalProps> = ({
  visible,
  onClose,
  chapters,
  downloadedChapters,
  onDownloadConfirm,
  onDeleteConfirm,
  initialTab = 'download',
  isProcessing = false,
}) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

  const sortedChapters = useMemo(
    () => sortChaptersByNumber(chapters),
    [chapters]
  );

  const downloadedChaptersSorted = useMemo(
    () => sortChaptersByNumber(downloadedChapters),
    [downloadedChapters]
  );

  const minChapter = useMemo(() => {
    if (!sortedChapters.length) {
      return 0;
    }
    return parseChapterNumber(sortedChapters[0]!.number);
  }, [sortedChapters]);

  const maxChapter = useMemo(() => {
    if (!sortedChapters.length) {
      return 0;
    }
    const lastChapter = sortedChapters[sortedChapters.length - 1]!;
    return parseChapterNumber(lastChapter.number);
  }, [sortedChapters]);

  const [activeTab, setActiveTab] = useState<PlannerTab>(initialTab);
  const [mode, setMode] = useState<PlannerMode>('all');
  const [upperLimit, setUpperLimit] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedDeletes, setSelectedDeletes] = useState<Set<string>>(
    new Set()
  );
  const [sortOption, setSortOption] = useState<SortOption>('number-asc');

  useEffect(() => {
    if (visible) {
      setActiveTab(
        downloadedChaptersSorted.length > 0 ? initialTab : 'download'
      );
      setMode('all');
      setUpperLimit('');
      setRangeStart('');
      setRangeEnd('');
      setError(null);
      setSelectedDeletes(new Set());
      setSortOption('number-asc');
    }
  }, [visible]);

  // Auto-switch to download tab if all downloads are removed while managing
  useEffect(() => {
    if (
      visible &&
      activeTab === 'manage' &&
      downloadedChaptersSorted.length === 0
    ) {
      setActiveTab('download');
    }
  }, [visible, activeTab, downloadedChaptersSorted.length]);

  useEffect(() => {
    setSelectedDeletes((prev) => {
      if (!prev.size) {
        return prev;
      }
      const validNumbers = new Set(
        downloadedChaptersSorted.map((chapter) => chapter.number)
      );
      let hasChanges = false;
      const next = new Set<string>();
      prev.forEach((value) => {
        if (validNumbers.has(value)) {
          next.add(value);
        } else {
          hasChanges = true;
        }
      });
      return hasChanges ? next : prev;
    });
  }, [downloadedChaptersSorted]);

  const closeModal = () => {
    onClose();
  };

  const getSortedDownloadedChapters = useMemo(() => {
    let sorted = [...downloadedChaptersSorted];

    if (sortOption.startsWith('number')) {
      sorted.sort((a, b) => {
        const numA = parseChapterNumber(a.number);
        const numB = parseChapterNumber(b.number);
        return sortOption === 'number-asc' ? numA - numB : numB - numA;
      });
    } else if (sortOption.startsWith('size')) {
      sorted.sort((a, b) => {
        const sizeA = (a as any).fileSize ?? 0;
        const sizeB = (b as any).fileSize ?? 0;
        return sortOption === 'size-asc' ? sizeA - sizeB : sizeB - sizeA;
      });
    }

    return sorted;
  }, [downloadedChaptersSorted, sortOption]);

  const toggleDeleteSelection = (chapterNumber: string) => {
    setSelectedDeletes((prev) => {
      const next = new Set(prev);
      if (next.has(chapterNumber)) {
        next.delete(chapterNumber);
      } else {
        next.add(chapterNumber);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const total = downloadedChaptersSorted.length;
    if (!total) {
      return;
    }

    setSelectedDeletes((prev) => {
      if (prev.size === total) {
        return new Set();
      }
      return new Set(
        downloadedChaptersSorted.map((chapter) => chapter.number)
      );
    });
  };

  const handleConfirm = () => {
    setError(null);

    if (!sortedChapters.length) {
      closeModal();
      return;
    }

    if (activeTab === 'manage') {
      if (!selectedDeletes.size) {
        setError('Select at least one chapter to remove');
        return;
      }
      const selected = downloadedChaptersSorted.filter((chapter) =>
        selectedDeletes.has(chapter.number)
      );
      if (!selected.length) {
        setError('No chapters selected for removal');
        return;
      }
      onDeleteConfirm(selected);
      closeModal();
      return;
    }

    if (mode === 'all') {
      onDownloadConfirm(sortedChapters, 'Downloading all chapters');
      closeModal();
      return;
    }

    const parseInput = (value: string) => {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? null : parsed;
    };

    if (mode === 'upto') {
      const limit = parseInput(upperLimit);
      if (limit === null) {
        setError('Enter a valid chapter number');
        return;
      }

      if (limit < minChapter) {
        setError(
          `Minimum available chapter is ${sortedChapters[0]!.number}`
        );
        return;
      }

      const selected = filterChaptersUpTo(sortedChapters, limit);
      if (!selected.length) {
        setError('No chapters in selected range');
        return;
      }

      onDownloadConfirm(selected, `Downloading up to chapter ${limit}`);
      closeModal();
      return;
    }

    const start = parseInput(rangeStart);
    const end = parseInput(rangeEnd);

    if (start === null || end === null) {
      setError('Enter valid chapter numbers for both fields');
      return;
    }

    if (start > end) {
      setError('Start chapter must be less than or equal to end chapter');
      return;
    }

    if (end < minChapter || start > maxChapter) {
      setError('Selected range is outside available chapters');
      return;
    }

    const selected = filterChaptersInRange(sortedChapters, start, end);
    if (!selected.length) {
      setError('No chapters in selected range');
      return;
    }

    onDownloadConfirm(
      selected,
      `Downloading chapters ${selected[0]!.number} to ${
        selected[selected.length - 1]!.number
      }`
    );
    closeModal();
  };

  const renderTabButton = (
    label: string,
    value: PlannerTab,
    icon: keyof typeof Ionicons.glyphMap
  ) => {
    const isActive = activeTab === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.tabButton, isActive && styles.tabButtonActive]}
        onPress={() => {
          setActiveTab(value);
          setError(null);
        }}
        activeOpacity={0.85}
      >
        <Ionicons
          name={icon}
          size={16}
          color={isActive ? colors.background : colors.text}
        />
        <Text
          style={[
            styles.tabButtonText,
            isActive && { color: colors.background },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSortButton = (
    label: string,
    value: SortOption,
    icon: keyof typeof Ionicons.glyphMap
  ) => {
    const isActive = sortOption === value;
    return (
      <TouchableOpacity
        key={value}
        style={[styles.sortButton, isActive && styles.sortButtonActive]}
        onPress={() => setSortOption(value)}
        activeOpacity={0.8}
      >
        <Ionicons
          name={icon}
          size={14}
          color={isActive ? colors.background : colors.tabIconDefault}
        />
        <Text
          style={[
            styles.sortButtonText,
            isActive && { color: colors.background },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const totalChapters = sortedChapters.length;
  const headerTitle = 'Offline downloads';

  const subtitleText =
    activeTab === 'manage'
      ? downloadedChaptersSorted.length
        ? 'Tap chapters you no longer need offline.'
        : 'No offline chapters yet. Download some to manage them here.'
      : totalChapters
        ? `Pick how many chapters to keep offline — ${
            sortedChapters[0]?.number ?? '—'
          } to ${
            sortedChapters[totalChapters - 1]?.number ?? '—'
          } available.`
        : 'Choose chapters to download for offline reading.';

  const confirmLabel =
    activeTab === 'manage' ? 'Remove selected' : 'Start download';

  const confirmDisabled =
    isProcessing ||
    (activeTab === 'manage'
      ? selectedDeletes.size === 0 || downloadedChaptersSorted.length === 0
      : false);

  const modeOptions: ModeOption[] = useMemo(
    () => [
      {
        value: 'all',
        title: 'Entire series',
        description: totalChapters
          ? `Download all ${totalChapters} chapters`
          : 'Download every available chapter',
        icon: 'albums-outline',
      },
      {
        value: 'upto',
        title: 'Up to a chapter',
        description: 'Stop at a specific chapter number',
        icon: 'flag-outline',
      },
      {
        value: 'range',
        title: 'Custom window',
        description: 'Pick an exact start and end range',
        icon: 'options-outline',
      },
    ],
    [totalChapters]
  );

  const renderModeOption = (option: ModeOption) => {
    const isActive = mode === option.value;
    return (
      <TouchableOpacity
        key={option.value}
        style={[styles.modeCard, isActive && styles.modeCardActive]}
        onPress={() => {
          setMode(option.value);
          setError(null);
        }}
        activeOpacity={0.9}
      >
        <View
          style={[
            styles.modeCardIconWrapper,
            isActive && styles.modeCardIconWrapperActive,
          ]}
        >
          <Ionicons
            name={option.icon}
            size={18}
            color={isActive ? colors.background : colors.primary}
          />
        </View>
        <Text
          style={[styles.modeCardTitle, isActive && styles.modeCardTitleActive]}
        >
          {option.title}
        </Text>
        <Text
          style={[
            styles.modeCardDescription,
            isActive && styles.modeCardDescriptionActive,
          ]}
        >
          {option.description}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={closeModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={styles.backdropTouchable}
            onPress={closeModal}
          />
        </View>
        <View style={styles.contentWrapper}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{headerTitle}</Text>
            <TouchableOpacity
              onPress={closeModal}
              accessibilityRole="button"
              disabled={isProcessing}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {downloadedChaptersSorted.length > 0 ? (
            <View style={styles.tabSwitcher}>
              {renderTabButton('Download', 'download', 'download-outline')}
              {renderTabButton('Manage', 'manage', 'trash-outline')}
            </View>
          ) : null}

          <Text style={styles.subtitle}>{subtitleText}</Text>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {activeTab === 'download' ? (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeading}>Download plan</Text>
                  <Text style={styles.sectionHint}>
                    Choose the amount of chapters to fetch
                  </Text>
                </View>

                <View style={styles.modeCardGrid}>
                  {modeOptions.map(renderModeOption)}
                </View>

                {mode === 'upto' ? (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Download up to chapter</Text>
                    <TextInput
                      value={upperLimit}
                      onChangeText={(val) =>
                        setUpperLimit(sanitizeNumberInput(val))
                      }
                      keyboardType="numeric"
                      placeholder="Enter chapter number"
                      placeholderTextColor={colors.tabIconDefault}
                      style={styles.input}
                    />
                  </View>
                ) : null}

                {mode === 'range' ? (
                  <View style={styles.rangeContainer}>
                    <View style={styles.inputGroupHalf}>
                      <Text style={styles.inputLabel}>From</Text>
                      <TextInput
                        value={rangeStart}
                        onChangeText={(val) =>
                          setRangeStart(sanitizeNumberInput(val))
                        }
                        keyboardType="numeric"
                        placeholder="Start chapter"
                        placeholderTextColor={colors.tabIconDefault}
                        style={styles.input}
                      />
                    </View>
                    <View style={styles.inputGroupHalf}>
                      <Text style={styles.inputLabel}>To</Text>
                      <TextInput
                        value={rangeEnd}
                        onChangeText={(val) =>
                          setRangeEnd(sanitizeNumberInput(val))
                        }
                        keyboardType="numeric"
                        placeholder="End chapter"
                        placeholderTextColor={colors.tabIconDefault}
                        style={styles.input}
                      />
                    </View>
                  </View>
                ) : null}

                <View style={styles.helperRow}>
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={styles.helperText}>
                    Chapters download sequentially from the earliest number.
                  </Text>
                </View>
              </>
            ) : (
              <>
                {downloadedChaptersSorted.length ? (
                  <>
                    <View style={styles.manageHeaderSection}>
                      <View style={styles.manageSummaryRow}>
                        <View style={styles.countPill}>
                          <Ionicons
                            name="download-outline"
                            size={14}
                            color={colors.primary}
                          />
                          <Text style={styles.countPillText}>
                            {selectedDeletes.size > 0
                              ? `${selectedDeletes.size} selected`
                              : `${downloadedChaptersSorted.length} stored`}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={toggleSelectAll}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.manageToggle}>
                            {selectedDeletes.size === downloadedChaptersSorted.length
                              ? 'Clear'
                              : 'Select all'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.sortButtonsContainer}>
                        <Text style={styles.sortLabel}>Sort by</Text>
                        <View style={styles.sortButtonsRow}>
                          {renderSortButton('Number ↑', 'number-asc', 'arrow-up')}
                          {renderSortButton('Number ↓', 'number-desc', 'arrow-down')}
                          {renderSortButton('Size ↑', 'size-asc', 'arrow-up')}
                          {renderSortButton('Size ↓', 'size-desc', 'arrow-down')}
                        </View>
                      </View>
                    </View>

                    <View style={styles.manageList}>
                      {getSortedDownloadedChapters.map((chapter) => {
                        const isSelected = selectedDeletes.has(
                          chapter.number
                        );
                        return (
                          <TouchableOpacity
                            key={chapter.number}
                            style={[
                              styles.manageItem,
                              isSelected && styles.manageItemSelected,
                            ]}
                            onPress={() =>
                              toggleDeleteSelection(chapter.number)
                            }
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name={
                                isSelected ? 'checkbox' : 'square-outline'
                              }
                              size={20}
                              color={
                                isSelected
                                  ? colors.primary
                                  : colors.tabIconDefault
                              }
                            />
                            <View style={styles.manageItemTextWrapper}>
                              <Text style={styles.manageItemTitle}>
                                Chapter {chapter.number}
                              </Text>
                              {chapter.title ? (
                                <Text
                                  style={styles.manageItemSubtitle}
                                  numberOfLines={1}
                                >
                                  {chapter.title}
                                </Text>
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons
                      name="cloud-download-outline"
                      size={24}
                      color={colors.tabIconDefault}
                    />
                    <Text style={styles.emptyStateText}>
                      Your offline list is empty.
                    </Text>
                    <Text style={styles.emptyStateHint}>
                      Use the download tab to save chapters for later.
                    </Text>
                  </View>
                )}
              </>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={closeModal}
              activeOpacity={0.8}
              disabled={isProcessing}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                confirmDisabled && styles.primaryButtonDisabled,
              ]}
              onPress={handleConfirm}
              activeOpacity={0.9}
              disabled={confirmDisabled}
            >
              <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    backdropTouchable: {
      flex: 1,
    },
    contentWrapper: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 24,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.tabIconDefault,
      marginBottom: 16,
    },
    scrollArea: {
      maxHeight: 360,
    },
    tabSwitcher: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    tabButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    tabButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tabButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    sectionHeaderRow: {
      marginBottom: 12,
      gap: 4,
    },
    sectionHeading: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    sectionHint: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    modeCardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 20,
    },
    modeCard: {
      flexBasis: '48%',
      flexGrow: 1,
      minWidth: 148,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 8,
    },
    modeCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '12',
    },
    modeCardIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '14',
    },
    modeCardIconWrapperActive: {
      backgroundColor: colors.primary,
    },
    modeCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    modeCardTitleActive: {
      color: colors.primary,
    },
    modeCardDescription: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.tabIconDefault,
    },
    modeCardDescriptionActive: {
      color: colors.text,
    },
    inputGroup: {
      marginBottom: 18,
    },
    inputLabel: {
      fontSize: 13,
      color: colors.tabIconDefault,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.background,
    },
    rangeContainer: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 18,
    },
    inputGroupHalf: {
      flex: 1,
    },
    helperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primary + '10',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    helperText: {
      flex: 1,
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    manageHeaderSection: {
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 12,
    },
    manageSummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    countPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary + '10',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    countPillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    manageToggle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    sortButtonsContainer: {
      gap: 8,
    },
    sortLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.tabIconDefault,
      marginBottom: 6,
    },
    sortButtonsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    sortButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    sortButtonText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    manageList: {
      gap: 10,
      marginBottom: 12,
    },
    manageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    manageItemSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '12',
    },
    manageItemTextWrapper: {
      flex: 1,
    },
    manageItemTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    manageItemSubtitle: {
      fontSize: 12,
      color: colors.tabIconDefault,
      marginTop: 2,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    emptyStateText: {
      fontSize: 13,
      color: colors.tabIconDefault,
    },
    emptyStateHint: {
      fontSize: 12,
      color: colors.tabIconDefault,
      marginTop: 6,
    },
    errorText: {
      color: colors.error,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
    },
    secondaryButton: {
      paddingVertical: 12,
      paddingHorizontal: 18,
    },
    secondaryButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    primaryButtonDisabled: {
      backgroundColor: colors.border,
    },
    primaryButtonText: {
      color: colors.background,
      fontSize: 16,
      fontWeight: '700',
    },
  });

export default BatchDownloadPlannerModal;

