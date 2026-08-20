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
  const [sortDesc, setSortDesc] = useState(false);

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
      setSortDesc(false);
    }
  }, [visible, downloadedChaptersSorted.length, initialTab]);

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

  const managedChapters = useMemo(() => {
    const sorted = [...downloadedChaptersSorted];
    sorted.sort((a, b) => {
      const numA = parseChapterNumber(a.number);
      const numB = parseChapterNumber(b.number);
      return sortDesc ? numB - numA : numA - numB;
    });
    return sorted;
  }, [downloadedChaptersSorted, sortDesc]);

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

  const totalChapters = sortedChapters.length;
  const chapterSpan =
    totalChapters > 0
      ? `${sortedChapters[0]?.number ?? '—'}–${
          sortedChapters[totalChapters - 1]?.number ?? '—'
        }`
      : null;

  const confirmLabel =
    activeTab === 'manage'
      ? selectedDeletes.size > 0
        ? `Remove ${selectedDeletes.size}`
        : 'Remove'
      : 'Download';

  const confirmDisabled =
    isProcessing ||
    (activeTab === 'manage'
      ? selectedDeletes.size === 0 || downloadedChaptersSorted.length === 0
      : false);

  const modes: Array<{ value: PlannerMode; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'upto', label: 'Up to' },
    { value: 'range', label: 'Range' },
  ];

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

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>Offline</Text>
              <Text style={styles.subtitle}>
                {activeTab === 'manage'
                  ? downloadedChaptersSorted.length
                    ? `${downloadedChaptersSorted.length} saved`
                    : 'Nothing saved yet'
                  : chapterSpan
                    ? `${totalChapters} chapters · ${chapterSpan}`
                    : 'No chapters available'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={closeModal}
              accessibilityRole="button"
              disabled={isProcessing}
              style={styles.closeButton}
              hitSlop={8}
            >
              <Ionicons name="close" size={18} color={colors.tabIconDefault} />
            </TouchableOpacity>
          </View>

          {downloadedChaptersSorted.length > 0 ? (
            <View style={styles.tabs}>
              {(
                [
                  { value: 'download', label: 'Download' },
                  { value: 'manage', label: 'Manage' },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.value;
                return (
                  <TouchableOpacity
                    key={tab.value}
                    style={[styles.tab, active && styles.tabActive]}
                    onPress={() => {
                      setActiveTab(tab.value);
                      setError(null);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[styles.tabText, active && styles.tabTextActive]}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === 'download' ? (
              <View style={styles.section}>
                <View style={styles.segment}>
                  {modes.map((option) => {
                    const active = mode === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.segmentItem,
                          active && styles.segmentItemActive,
                        ]}
                        onPress={() => {
                          setMode(option.value);
                          setError(null);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            active && styles.segmentTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {mode === 'all' ? (
                  <Text style={styles.hint}>
                    Saves every available chapter for offline reading.
                  </Text>
                ) : null}

                {mode === 'upto' ? (
                  <View style={styles.fieldBlock}>
                    <Text style={styles.fieldLabel}>Through chapter</Text>
                    <TextInput
                      value={upperLimit}
                      onChangeText={(val) =>
                        setUpperLimit(sanitizeNumberInput(val))
                      }
                      keyboardType="numeric"
                      placeholder={
                        maxChapter ? String(maxChapter) : 'Chapter number'
                      }
                      placeholderTextColor={colors.tabIconDefault}
                      style={styles.input}
                      autoFocus
                    />
                  </View>
                ) : null}

                {mode === 'range' ? (
                  <View style={styles.rangeFields}>
                    <View style={styles.fieldBlockGrow}>
                      <Text style={styles.fieldLabel}>From</Text>
                      <TextInput
                        value={rangeStart}
                        onChangeText={(val) =>
                          setRangeStart(sanitizeNumberInput(val))
                        }
                        keyboardType="numeric"
                        placeholder={
                          minChapter ? String(minChapter) : 'Start'
                        }
                        placeholderTextColor={colors.tabIconDefault}
                        style={styles.input}
                        autoFocus
                      />
                    </View>
                    <View style={styles.fieldBlockGrow}>
                      <Text style={styles.fieldLabel}>To</Text>
                      <TextInput
                        value={rangeEnd}
                        onChangeText={(val) =>
                          setRangeEnd(sanitizeNumberInput(val))
                        }
                        keyboardType="numeric"
                        placeholder={maxChapter ? String(maxChapter) : 'End'}
                        placeholderTextColor={colors.tabIconDefault}
                        style={styles.input}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : downloadedChaptersSorted.length ? (
              <View style={styles.section}>
                <View style={styles.manageToolbar}>
                  <TouchableOpacity
                    onPress={toggleSelectAll}
                    activeOpacity={0.7}
                    hitSlop={6}
                  >
                    <Text style={styles.toolbarAction}>
                      {selectedDeletes.size === downloadedChaptersSorted.length
                        ? 'Deselect all'
                        : 'Select all'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSortDesc((value) => !value)}
                    activeOpacity={0.7}
                    style={styles.sortButton}
                    hitSlop={6}
                  >
                    <Text style={styles.toolbarAction}>Number</Text>
                    <Ionicons
                      name={sortDesc ? 'arrow-down' : 'arrow-up'}
                      size={14}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.manageList}>
                  {managedChapters.map((chapter) => {
                    const isSelected = selectedDeletes.has(chapter.number);
                    return (
                      <TouchableOpacity
                        key={chapter.number}
                        style={styles.manageRow}
                        onPress={() => toggleDeleteSelection(chapter.number)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            isSelected && styles.checkboxSelected,
                          ]}
                        >
                          {isSelected ? (
                            <Ionicons
                              name="checkmark"
                              size={12}
                              color={colors.background}
                            />
                          ) : null}
                        </View>
                        <View style={styles.manageRowText}>
                          <Text style={styles.manageTitle}>
                            Chapter {chapter.number}
                          </Text>
                          {chapter.title ? (
                            <Text
                              style={styles.manageSubtitle}
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
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No offline chapters</Text>
                <Text style={styles.emptyHint}>
                  Download a range first, then manage it here.
                </Text>
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.ghostButton}
              onPress={closeModal}
              activeOpacity={0.7}
              disabled={isProcessing}
            >
              <Text style={styles.ghostButtonText}>Cancel</Text>
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
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
    },
    backdropTouchable: {
      flex: 1,
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 28 : 20,
      maxHeight: '78%',
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 16,
    },
    headerTextBlock: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 13,
      color: colors.tabIconDefault,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    tabs: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 16,
      padding: 4,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: 9,
    },
    tabActive: {
      backgroundColor: colors.card,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    tabTextActive: {
      color: colors.text,
    },
    scroll: {
      maxHeight: 360,
    },
    scrollContent: {
      paddingBottom: 8,
    },
    section: {
      gap: 14,
    },
    segment: {
      flexDirection: 'row',
      gap: 6,
      padding: 4,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    segmentItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 9,
    },
    segmentItemActive: {
      backgroundColor: colors.primary,
    },
    segmentText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    segmentTextActive: {
      color: colors.background,
    },
    hint: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.tabIconDefault,
    },
    fieldBlock: {
      gap: 6,
    },
    fieldBlockGrow: {
      flex: 1,
      gap: 6,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.background,
    },
    rangeFields: {
      flexDirection: 'row',
      gap: 10,
    },
    manageToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toolbarAction: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    manageList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    manageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    manageRowText: {
      flex: 1,
      gap: 2,
    },
    manageTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    manageSubtitle: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
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
      paddingVertical: 28,
      gap: 4,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    emptyHint: {
      fontSize: 13,
      color: colors.tabIconDefault,
      textAlign: 'center',
    },
    errorText: {
      marginTop: 12,
      fontSize: 13,
      fontWeight: '600',
      color: colors.error,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
    },
    ghostButton: {
      paddingVertical: 14,
      paddingHorizontal: 8,
    },
    ghostButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.tabIconDefault,
    },
    primaryButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
    },
    primaryButtonDisabled: {
      backgroundColor: colors.border,
    },
    primaryButtonText: {
      color: colors.background,
      fontSize: 15,
      fontWeight: '700',
    },
  });

export default BatchDownloadPlannerModal;
