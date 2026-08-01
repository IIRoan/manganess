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
import { useTheme } from '@/hooks/useTheme';
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
  }, [visible, downloadedChaptersSorted.length, initialTab]);

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
      return new Set(downloadedChaptersSorted.map((chapter) => chapter.number));
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
        setError(`Minimum available chapter is ${sortedChapters[0]!.number}`);
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
        activeOpacity={0.8}
      >
        <Ionicons
          name={icon}
          size={16}
          color={isActive ? '#FFF' : colors.text}
        />
        <Text
          style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}
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
        style={[styles.sortChip, isActive && styles.sortChipActive]}
        onPress={() => setSortOption(value)}
        activeOpacity={0.8}
      >
        <Text
          style={[styles.sortChipText, isActive && styles.sortChipTextActive]}
        >
          {label}
        </Text>
        <Ionicons
          name={icon}
          size={12}
          color={isActive ? '#FFF' : colors.tabIconDefault}
        />
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
          } to ${sortedChapters[totalChapters - 1]?.number ?? '—'} available.`
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={closeModal}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={styles.backdropTouchable}
            onPress={closeModal}
            activeOpacity={1}
          />
        </View>
        <View style={styles.contentWrapper}>
          <View style={styles.handleBar} />

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{headerTitle}</Text>
              <Text style={styles.subtitle}>{subtitleText}</Text>
            </View>
            <TouchableOpacity
              onPress={closeModal}
              accessibilityRole="button"
              disabled={isProcessing}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={colors.tabIconDefault} />
            </TouchableOpacity>
          </View>

          {downloadedChaptersSorted.length > 0 ? (
            <View style={styles.tabSwitcher}>
              {renderTabButton('Download', 'download', 'download-outline')}
              {renderTabButton('Manage', 'manage', 'trash-outline')}
            </View>
          ) : null}

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === 'download' ? (
              <View style={styles.downloadTabContent}>
                {modeOptions.map((option) => {
                  const isActive = mode === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.modeCard,
                        isActive && styles.modeCardActive,
                      ]}
                      onPress={() => {
                        setMode(option.value);
                        setError(null);
                      }}
                      activeOpacity={0.9}
                    >
                      <View style={styles.modeCardHeader}>
                        <View
                          style={[
                            styles.modeCardIconWrapper,
                            isActive && styles.modeCardIconWrapperActive,
                          ]}
                        >
                          <Ionicons
                            name={option.icon}
                            size={20}
                            color={isActive ? '#FFF' : colors.primary}
                          />
                        </View>
                        <View style={styles.modeCardTextContainer}>
                          <Text
                            style={[
                              styles.modeCardTitle,
                              isActive && styles.modeCardTitleActive,
                            ]}
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
                        </View>
                        <View
                          style={[
                            styles.radioButton,
                            isActive && styles.radioButtonActive,
                          ]}
                        >
                          {isActive && <View style={styles.radioButtonInner} />}
                        </View>
                      </View>

                      {isActive && option.value === 'upto' && (
                        <View style={styles.cardInputContainer}>
                          <TextInput
                            value={upperLimit}
                            onChangeText={(val) =>
                              setUpperLimit(sanitizeNumberInput(val))
                            }
                            keyboardType="numeric"
                            placeholder="Enter chapter number..."
                            placeholderTextColor={colors.tabIconDefault}
                            style={styles.cardInput}
                            autoFocus
                          />
                        </View>
                      )}

                      {isActive && option.value === 'range' && (
                        <View style={styles.cardInputContainer}>
                          <View style={styles.rangeRow}>
                            <View style={styles.rangeInputWrapper}>
                              <Text style={styles.rangeLabel}>From</Text>
                              <TextInput
                                value={rangeStart}
                                onChangeText={(val) =>
                                  setRangeStart(sanitizeNumberInput(val))
                                }
                                keyboardType="numeric"
                                placeholder="Start"
                                placeholderTextColor={colors.tabIconDefault}
                                style={styles.cardInput}
                                autoFocus
                              />
                            </View>
                            <View style={styles.rangeDivider} />
                            <View style={styles.rangeInputWrapper}>
                              <Text style={styles.rangeLabel}>To</Text>
                              <TextInput
                                value={rangeEnd}
                                onChangeText={(val) =>
                                  setRangeEnd(sanitizeNumberInput(val))
                                }
                                keyboardType="numeric"
                                placeholder="End"
                                placeholderTextColor={colors.tabIconDefault}
                                style={styles.cardInput}
                              />
                            </View>
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                <View style={styles.helperRow}>
                  <Ionicons
                    name="information-circle"
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={styles.helperText}>
                    Downloads start from the earliest chapter.
                  </Text>
                </View>
              </View>
            ) : (
              <>
                {downloadedChaptersSorted.length ? (
                  <>
                    <View style={styles.manageHeaderSection}>
                      <View style={styles.manageToolbar}>
                        <Text style={styles.manageSectionTitle}>
                          {downloadedChaptersSorted.length} Items
                        </Text>
                        <TouchableOpacity
                          onPress={toggleSelectAll}
                          activeOpacity={0.7}
                          style={styles.selectAllButton}
                        >
                          <Text style={styles.selectAllText}>
                            {selectedDeletes.size ===
                            downloadedChaptersSorted.length
                              ? 'Deselect All'
                              : 'Select All'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.sortRow}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.sortChipsContainer}
                        >
                          {renderSortButton('Number', 'number-asc', 'arrow-up')}
                          {renderSortButton(
                            'Number',
                            'number-desc',
                            'arrow-down'
                          )}
                          {renderSortButton('Size', 'size-asc', 'arrow-up')}
                          {renderSortButton('Size', 'size-desc', 'arrow-down')}
                        </ScrollView>
                      </View>
                    </View>

                    <View style={styles.manageList}>
                      {getSortedDownloadedChapters.map((chapter) => {
                        const isSelected = selectedDeletes.has(chapter.number);
                        // Mock file size if not present, or format it
                        const fileSize = (chapter as any).fileSize
                          ? ((chapter as any).fileSize / 1024 / 1024).toFixed(
                              1
                            ) + ' MB'
                          : null;

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
                            activeOpacity={0.7}
                          >
                            <View style={styles.manageItemContent}>
                              <View style={styles.manageItemTopRow}>
                                <Text
                                  style={[
                                    styles.manageItemTitle,
                                    isSelected &&
                                      styles.manageItemTitleSelected,
                                  ]}
                                >
                                  Chapter {chapter.number}
                                </Text>
                                {fileSize && (
                                  <View style={styles.sizeBadge}>
                                    <Text style={styles.sizeBadgeText}>
                                      {fileSize}
                                    </Text>
                                  </View>
                                )}
                              </View>

                              {(chapter.title || !fileSize) && (
                                <Text
                                  style={styles.manageItemSubtitle}
                                  numberOfLines={1}
                                >
                                  {chapter.title || 'Downloaded'}
                                </Text>
                              )}
                            </View>

                            <View
                              style={[
                                styles.checkbox,
                                isSelected && styles.checkboxSelected,
                              ]}
                            >
                              {isSelected && (
                                <Ionicons
                                  name="checkmark"
                                  size={14}
                                  color="#FFF"
                                />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyStateIcon}>
                      <Ionicons
                        name="cloud-download-outline"
                        size={32}
                        color={colors.tabIconDefault}
                      />
                    </View>
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

            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={closeModal}
              activeOpacity={0.7}
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
              {!confirmDisabled && !isProcessing && (
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={colors.background}
                />
              )}
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
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    backdropTouchable: {
      flex: 1,
    },
    contentWrapper: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 34,
      maxHeight: '85%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 20,
    },
    handleBar: {
      width: 48,
      height: 5,
      backgroundColor: colors.border,
      borderRadius: 3,
      alignSelf: 'center',
      marginBottom: 20,
      opacity: 0.6,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 4,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      color: colors.tabIconDefault,
      lineHeight: 20,
    },
    closeButton: {
      padding: 4,
      backgroundColor: colors.background,
      borderRadius: 20,
    },
    scrollArea: {
      maxHeight: 400,
    },
    tabSwitcher: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      padding: 6,
      borderRadius: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
    },
    tabButtonActive: {
      backgroundColor: colors.primary,
    },
    tabButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    tabButtonTextActive: {
      color: '#FFF',
      fontWeight: '700',
    },
    downloadTabContent: {
      gap: 12,
    },
    modeCard: {
      backgroundColor: colors.background,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    modeCardActive: {
      backgroundColor: colors.card,
      borderColor: colors.primary,
      borderWidth: 2,
    },
    modeCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    modeCardIconWrapper: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeCardIconWrapperActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    modeCardTextContainer: {
      flex: 1,
    },
    modeCardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    modeCardTitleActive: {
      color: colors.primary,
    },
    modeCardDescription: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    modeCardDescriptionActive: {
      color: colors.text,
    },
    radioButton: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.tabIconDefault,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioButtonActive: {
      borderColor: colors.primary,
    },
    radioButtonInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    cardInputContainer: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cardInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    rangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rangeInputWrapper: {
      flex: 1,
      gap: 6,
    },
    rangeLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    rangeDivider: {
      width: 12,
      height: 1,
      backgroundColor: colors.border,
      marginTop: 20, // Align with input center approx
    },
    helperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.primary + '10', // 10% opacity
      borderRadius: 12,
      padding: 14,
      marginTop: 8,
      marginBottom: 16,
    },
    helperText: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
    manageHeaderSection: {
      marginBottom: 16,
      paddingBottom: 4,
    },
    manageToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    manageSectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    selectAllButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    selectAllText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    sortRow: {
      marginBottom: 8,
    },
    sortChipsContainer: {
      gap: 8,
      paddingRight: 16,
    },
    sortChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sortChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    sortChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    sortChipTextActive: {
      color: '#FFF',
    },
    manageList: {
      gap: 10,
      marginBottom: 12,
    },
    manageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    manageItemSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.card,
    },
    manageItemContent: {
      flex: 1,
      marginRight: 12,
    },
    manageItemTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    manageItemTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    manageItemTitleSelected: {
      color: colors.primary,
    },
    sizeBadge: {
      backgroundColor: colors.border,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    sizeBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.tabIconDefault,
    },
    manageItemSubtitle: {
      fontSize: 13,
      color: colors.tabIconDefault,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    checkboxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
    },
    emptyStateIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyStateText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    emptyStateHint: {
      fontSize: 14,
      color: colors.tabIconDefault,
      textAlign: 'center',
      maxWidth: 200,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.error + '15',
      padding: 12,
      borderRadius: 12,
      marginTop: 12,
    },
    errorText: {
      color: colors.error,
      fontSize: 14,
      fontWeight: '600',
      flex: 1,
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      marginTop: 12,
    },
    secondaryButton: {
      paddingVertical: 16,
      paddingHorizontal: 12,
    },
    secondaryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    primaryButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingHorizontal: 24,
      paddingVertical: 16,
    },
    primaryButtonDisabled: {
      backgroundColor: colors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    primaryButtonText: {
      color: colors.background,
      fontSize: 16,
      fontWeight: '700',
    },
  });

export default BatchDownloadPlannerModal;
