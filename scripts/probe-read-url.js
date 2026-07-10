const axios = require('axios');

const BASE = 'https://mangafire.to';
const headers = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  Referer: BASE,
};

async function main() {
  const js = (
    await axios.get('https://s.mfcdn.nl/build/mf/assets/main-thybvr-LXBS2lak.js')
  ).data;

  for (const needle of ['/read/', 'ajax/read', 'chapter/', 'getChapter']) {
    let pos = 0;
    let n = 0;
    while ((pos = js.indexOf(needle, pos)) !== -1 && n < 3) {
      console.log(`\n=== ${needle} ===`);
      console.log(js.slice(Math.max(0, pos - 80), pos + 180));
      pos += needle.length;
      n++;
    }
  }

  const chapterId = 1326884;
  const paths = [
    `/api/chapters/${chapterId}`,
    `/api/chapters/${chapterId}/pages`,
    `/ajax/read/chapter/${chapterId}`,
  ];
  for (const p of paths) {
    try {
      const r = await axios.get(`${BASE}${p}`, {
        headers,
        validateStatus: () => true,
        timeout: 15000,
      });
      const body =
        typeof r.data === 'string'
          ? r.data.slice(0, 300)
          : JSON.stringify(r.data).slice(0, 600);
      console.log(`\n${p} -> ${r.status}`);
      console.log(body);
    } catch (e) {
      console.log(`\n${p} ERR`, e.message);
    }
  }

  const readUrls = [
    `${BASE}/read/92kk8-naruto/en/chapter-700`,
    `${BASE}/read/naruto/en/chapter-700`,
  ];
  for (const url of readUrls) {
    const r = await axios.get(url, {
      headers: { ...headers, Accept: 'text/html' },
      validateStatus: () => true,
    });
    console.log(`\n${url} -> ${r.status} len ${String(r.data).length} app-root ${String(r.data).includes('app-root')}`);
  }
}

main().catch(console.error);
