/**
 * Strip the chapter number prefix from a title since the badge already shows it.
 *
 * Handles formats from mangaFireService:
 *   "Chapter 5: The Beginning" → "The Beginning"
 *   "Chapter 5.5 - Side Story" → "Side Story"
 *   "Ch. 10: Finale"           → "Finale"
 *   "Chapter 5"                → null (number-only, badge is enough)
 *   "5"                        → null
 *
 * Returns null when nothing meaningful remains after stripping,
 * so the card can show badge + date only.
 *
 * @param title - The full chapter title
 * @param chapterNumber - The chapter number to match
 * @returns The stripped title or null if nothing meaningful remains
 */
export function stripChapterPrefix(
  title: string,
  chapterNumber: string
): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const num = chapterNumber.trim();

  // Try stripping known prefixes: "chapter", "ch.", "ch"
  const prefixes = ['chapter', 'ch.', 'ch'];

  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      const afterPrefix = trimmed.slice(prefix.length).trimStart();

      // Check if the number follows the prefix
      if (
        afterPrefix === num ||
        afterPrefix.startsWith(`${num} `) ||
        afterPrefix.startsWith(`${num}:`) ||
        afterPrefix.startsWith(`${num}-`) ||
        afterPrefix.startsWith(`${num}\u2013`) || // en-dash
        afterPrefix.startsWith(`${num}\u2014`) // em-dash
      ) {
        const afterNum = afterPrefix.slice(num.length);
        // Strip separator chars: colon, dash, en-dash, em-dash, whitespace
        const rest = afterNum.replace(/^[\s:\-\u2013\u2014]+/, '').trim();
        return rest || null;
      }
    }
  }

  // Title might just be the raw number (e.g. "5" or "5.5")
  if (trimmed === num) return null;

  // Return original title if no prefix matched
  return trimmed;
}
