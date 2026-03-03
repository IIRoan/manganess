import { stripChapterPrefix } from '../stripChapterPrefix';

describe('stripChapterPrefix', () => {
  it('strips "Chapter X:" prefix', () => {
    expect(stripChapterPrefix('Chapter 5: The Beginning', '5')).toBe(
      'The Beginning'
    );
  });

  it('strips "Chapter X -" prefix', () => {
    expect(stripChapterPrefix('Chapter 5.5 - Side Story', '5.5')).toBe(
      'Side Story'
    );
  });

  it('strips "Ch. X:" prefix', () => {
    expect(stripChapterPrefix('Ch. 10: Finale', '10')).toBe('Finale');
  });

  it('returns null for number-only titles', () => {
    expect(stripChapterPrefix('Chapter 5', '5')).toBeNull();
    expect(stripChapterPrefix('5', '5')).toBeNull();
  });

  it('returns null for empty strings', () => {
    expect(stripChapterPrefix('', '5')).toBeNull();
    expect(stripChapterPrefix('   ', '5')).toBeNull();
  });

  it('handles en-dash separator', () => {
    expect(stripChapterPrefix('Chapter 5\u2013The End', '5')).toBe('The End');
  });

  it('handles em-dash separator', () => {
    expect(stripChapterPrefix('Chapter 5\u2014The End', '5')).toBe('The End');
  });

  it('returns original title if no prefix matches', () => {
    expect(stripChapterPrefix('The Beginning', '5')).toBe('The Beginning');
  });

  it('handles decimal chapter numbers', () => {
    expect(stripChapterPrefix('Chapter 5.5: Extra', '5.5')).toBe('Extra');
  });

  it('handles whitespace variations', () => {
    expect(stripChapterPrefix('Chapter  5 :  The Beginning', '5')).toBe(
      'The Beginning'
    );
  });

  it('preserves case in the result', () => {
    expect(stripChapterPrefix('Chapter 5: THE BEGINNING', '5')).toBe(
      'THE BEGINNING'
    );
  });
});
