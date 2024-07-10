// services/mangaApi.ts

export interface MangaItem {
  id: string;
  title: string;
  banner: string;
  link: string;
}

export const searchManga = async (keyword: string): Promise<MangaItem[]> => {
  try {
    const response = await fetch(`https://mangafire.to/filter?keyword=${encodeURIComponent(keyword)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
      },
    });
    
    const html = await response.text();
    const mangaRegex = /<div class="info">.*?<a href="(.*?)">(.*?)<\/a>.*?<img src="(.*?)".*?<\/div>/gs;
    const matches = [...html.matchAll(mangaRegex)];
    
    return matches.map(match => {
      const link = match[1];
      const id = link.split('/').pop() || '';
      return {
        id,
        link: `https://mangafire.to${link}`,
        title: match[2].trim(),
        banner: match[3],
      };
    });
  } catch (error) {
    console.error('Error searching manga:', error);
    return [];
  }
};
