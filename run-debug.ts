// Simple runner for the MangaFire API debug script
import { debugMangaFireAPI } from './debug-mangafire-api';

async function runDebug() {
  try {
    console.log('🔧 MangaFire API Debug Runner');
    console.log('Starting debug process...\n');

    const results = await debugMangaFireAPI();

    console.log('\n' + '='.repeat(50));
    console.log('🏁 Debug process completed!');

    const successful = results.filter((r) => r.success).length;
    const total = results.length;

    console.log(`📊 Success rate: ${successful}/${total} steps`);

    if (successful === total) {
      console.log('🎉 All steps completed successfully!');
      console.log('The MangaFire API integration should now work.');
    } else {
      console.log('⚠️  Some steps failed. Check the logs above for details.');
    }
  } catch (error) {
    console.error('💥 Fatal error:', error);
  }
}

// Run the debug
runDebug();
