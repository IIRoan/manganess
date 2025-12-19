/**
 * Layout constants for consistent UI across the app
 * Use these values to ensure all screens have uniform spacing, typography, and styling
 */

// Spacing scale (in pixels)
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

// Standard layout values
export const Layout = {
  // Screen padding
  screenPaddingHorizontal: Spacing.lg, // 16px - standard horizontal padding for all screens
  screenPaddingVertical: Spacing.lg,

  // Section spacing
  sectionMarginBottom: Spacing.xxl, // 24px - space between major sections
  sectionTitleMarginBottom: Spacing.lg, // 16px - space below section titles

  // Header spacing
  headerPaddingBottom: Spacing.md, // 12px - padding below screen headers

  // Card styling
  cardBorderRadius: 12,
  cardPadding: Spacing.lg, // 16px

  // Button styling
  buttonBorderRadius: 12,
  buttonPaddingVertical: Spacing.md, // 12px
  buttonPaddingHorizontal: Spacing.xl, // 20px

  // Input styling
  inputHeight: 44,
  inputBorderRadius: 10,
  inputPaddingHorizontal: Spacing.md, // 12px

  // Icon background (used in section titles)
  iconBackgroundSize: 36,

  // List item spacing
  listItemMarginBottom: Spacing.md, // 12px
  listItemPadding: Spacing.lg, // 16px

  // Grid spacing
  gridGap: Spacing.lg, // 16px

  // Bottom content padding (to account for tab bar)
  bottomPadding: 100,
} as const;

// Typography scale
export const Typography = {
  // Page titles (main screen header)
  pageTitle: {
    fontSize: 26,
    fontWeight: 'bold' as const,
  },

  // Section titles (within screens)
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
  },

  // Subsection titles
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
  },

  // Body text
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
  },

  // Small text (captions, labels)
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
  },

  // Extra small text (badges, counts)
  small: {
    fontSize: 12,
    fontWeight: '500' as const,
  },

  // Card/item titles
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold' as const,
  },

  // Button text
  button: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
} as const;

// Common style patterns that can be spread into StyleSheet.create()
export const CommonStyles = {
  // Standard page title style
  pageTitle: {
    fontSize: Typography.pageTitle.fontSize,
    fontWeight: Typography.pageTitle.fontWeight,
  },

  // Standard section title container
  sectionTitleContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    marginBottom: Layout.sectionTitleMarginBottom,
  },

  // Standard section title text
  sectionTitle: {
    fontSize: Typography.sectionTitle.fontSize,
    fontWeight: Typography.sectionTitle.fontWeight,
  },

  // Standard icon background (for section icons)
  iconBackground: {
    width: Layout.iconBackgroundSize,
    height: Layout.iconBackgroundSize,
    borderRadius: Layout.iconBackgroundSize / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: Spacing.md,
  },

  // Standard card style
  card: {
    borderRadius: Layout.cardBorderRadius,
    padding: Layout.cardPadding,
  },

  // Standard search input container
  searchInputContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: Layout.inputBorderRadius,
    paddingHorizontal: Layout.inputPaddingHorizontal,
    height: Layout.inputHeight,
  },

  // Standard button
  button: {
    borderRadius: Layout.buttonBorderRadius,
    paddingVertical: Layout.buttonPaddingVertical,
    paddingHorizontal: Layout.buttonPaddingHorizontal,
  },

  // Standard screen content container
  screenContent: {
    paddingBottom: Layout.bottomPadding,
  },

  // Standard section
  section: {
    marginBottom: Layout.sectionMarginBottom,
  },
} as const;
