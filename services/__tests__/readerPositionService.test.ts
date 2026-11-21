import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getReaderPosition,
  saveReaderPosition,
} from '../readerPositionService';

describe('readerPositionService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('resumes the last saved page per chapter', async () => {
    expect(await getReaderPosition('m1', '5')).toBe(0);

    void saveReaderPosition('m1', '5', 3);
    void saveReaderPosition('m1', '5', 7);
    void saveReaderPosition('m1', '6', 2);

    expect(await getReaderPosition('m1', '5')).toBe(7);
    expect(await getReaderPosition('m1', '6')).toBe(2);
    expect(await getReaderPosition('m2', '5')).toBe(0);
  });

  it('drops the entry when back on the first page', async () => {
    await saveReaderPosition('m1', '5', 4);
    await saveReaderPosition('m1', '5', 0);

    const raw = JSON.parse(
      (await AsyncStorage.getItem('reader_page_positions')) ?? '{}'
    );
    expect(raw).toEqual({});
  });

  it('keeps only the most recent 500 chapters', async () => {
    const seeded: Record<string, number> = {};
    for (let i = 0; i < 500; i++) seeded[`m:${i}`] = 1;
    await AsyncStorage.setItem('reader_page_positions', JSON.stringify(seeded));

    await saveReaderPosition('m', '0', 9);
    await saveReaderPosition('m', 'new', 2);

    expect(await getReaderPosition('m', '0')).toBe(9);
    expect(await getReaderPosition('m', 'new')).toBe(2);
    expect(await getReaderPosition('m', '1')).toBe(0);
  });
});
