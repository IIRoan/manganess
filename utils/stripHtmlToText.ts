import { decode } from 'html-entities';

/**
 * Strips HTML to plain text without reconstructable tags.
 * Removes angle brackets individually so sanitization cannot be bypassed
 * via nested or malformed tag sequences.
 */
export function stripHtmlToText(input: string): string {
  if (!input) {
    return '';
  }

  const withLineBreaks = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n');

  const withoutTags = withLineBreaks.replace(/<|>/g, '');

  return decode(withoutTags).replace(/\n{3,}/g, '\n\n').trim();
}
