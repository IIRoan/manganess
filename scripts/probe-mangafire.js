const axios = require('axios');

const BASE = 'https://mangafire.to';
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  Accept: 'application/json, text/plain, */*',
  Referer: BASE,
};

async function probe(label, url, params) {
  try {
    const r = await axios.get(url, {
      headers,
      params,
      timeout: 15000,
      validateStatus: () => true,
    });
    const preview =
      typeof r.data === 'string'
        ? r.data.slice(0, 200)
        : JSON.stringify(r.data).slice(0, 800);
    console.log(`\n${label} -> ${r.status}`);
    console.log(preview);
  } catch (e) {
    console.log(`\n${label} -> ERR ${e.message}`);
  }
}

async function main() {
  await probe('top-titles root', `${BASE}/top-titles`, {
    type: 'trending',
    days: 7,
    limit: 5,
  });
  await probe('api top-titles', `${BASE}/api/top-titles`, {
    type: 'trending',
    days: 7,
    limit: 5,
  });
  await probe('titles new', `${BASE}/titles`, {
    'order[chapter_updated_at]': 'desc',
    limit: 5,
  });
  await probe('api titles', `${BASE}/api/titles`, {
    keyword: 'naruto',
    limit: 5,
  });
  await probe('titles search', `${BASE}/titles`, {
    keyword: 'naruto',
    limit: 5,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
