const axios = require('axios');

async function main() {
  const jsUrl = 'https://s.mfcdn.nl/build/mf/assets/main-thybvr-LXBS2lak.js';
  const r = await axios.get(jsUrl, {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const js = r.data;

  const fsIdx = js.indexOf('async function fs');
  const dsIdx = js.indexOf('async function ds');
  console.log('fs:', js.slice(fsIdx, fsIdx + 800));
  console.log('\n---\n');
  console.log('ds:', js.slice(dsIdx, dsIdx + 800));

  const zoIdx = js.indexOf('function zo(');
  console.log('\n---\n');
  console.log('zo:', js.slice(zoIdx, zoIdx + 400));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
