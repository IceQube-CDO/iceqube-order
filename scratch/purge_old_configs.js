const SUPABASE_URL = 'https://tbbezmpobjdkwpoflfcs.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiYmV6bXBvYmpka3dwb2ZsZmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTI1MzIsImV4cCI6MjA5MjI2ODUzMn0.Wt3wDzE8CBpBEQCa2rb8OJM42uBEL8bjWlddqc0yWJs';

const configKeys = [
  'CONFIG_ICE_CASHFLOW',
  'CONFIG_ICEQUBE_CONSUMABLES',
  'CONFIG_ICEQUBE_ASSETS',
  'CONFIG_ICEQUBE_UTILITIES',
  'CONFIG_ICEQUBE_UTILITY_STATUS',
  'CONFIG_ICEQUBE_UTILITY_PAID_DATES',
  'CONFIG_ICEQUBE_MAINTENANCE_LOGS',
  'CONFIG_ICEQUBE_ICE_MACHINES',
  'CONFIG_ICEQUBE_RENTAL',
  'CONFIG_ICEQUBE_VACATION_MODE',
  'CONFIG_PURGE',
  'CONFIG_ICEQUBE_TEAM_MEMBERS',
  'CONFIG_ICEQUBE_CUSTOMER_PROFILES',
  'CONFIG_PRICING_MATRIX'
];

(async () => {
  try {
    console.log('Starting Supabase cleanup script via targeted sequential loop...');
    const idsToKeep = [];

    // 1. Fetch the latest record for each config key to protect them
    for (const key of configKeys) {
      const url = `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${key}&order=created_at.desc&limit=1`;
      const res = await fetch(url, {
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          console.log(`Protecting ${key}: id=${data[0].id}, created_at=${data[0].created_at}`);
          idsToKeep.push(data[0].id);
        }
      }
    }

    console.log(`Protecting ${idsToKeep.length} active config records.`);

    // 2. Loop and delete 1 record at a time
    let deletedCount = 0;
    let failedCount = 0;
    let consecutiveFailures = 0;

    while (true) {
      if (consecutiveFailures > 10) {
        console.error('Too many consecutive failures. Exiting loop.');
        break;
      }

      // Fetch 100 IDs to delete
      const fetchUrl = `${SUPABASE_URL}/rest/v1/orders?customer_name=eq.SYSTEM_CONFIG&select=id&id=not.in.(${idsToKeep.join(',')})&limit=100`;
      const fetchRes = await fetch(fetchUrl, {
        headers: {
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`
        }
      });
      
      if (!fetchRes.ok) {
        console.error('Failed to fetch IDs:', fetchRes.status);
        consecutiveFailures++;
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      
      const rows = await fetchRes.json();
      if (!rows || rows.length === 0) {
        console.log('No more records to delete.');
        break;
      }
      
      console.log(`Fetched ${rows.length} records to delete. Processing with worker pool (concurrency=5)...`);
      
      let index = 0;
      const concurrency = 5;
      
      async function worker() {
        while (index < rows.length) {
          const currentIndex = index++;
          const row = rows[currentIndex];
          if (!row) break;
          
          const deleteUrl = `${SUPABASE_URL}/rest/v1/orders?id=eq.${row.id}`;
          try {
            const deleteRes = await fetch(deleteUrl, {
              method: 'DELETE',
              headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`
              }
            });
            
            if (deleteRes.ok) {
              deletedCount++;
              consecutiveFailures = 0;
              console.log(`Deleted row ${row.id} (Success: ${deletedCount}, Fail: ${failedCount})`);
            } else {
              failedCount++;
              consecutiveFailures++;
              const errBody = await deleteRes.text().catch(() => '');
              console.error(`Failed to delete row ${row.id}: status=${deleteRes.status}, error=${errBody}`);
            }
          } catch (e) {
            failedCount++;
            consecutiveFailures++;
            console.error(`Error deleting row ${row.id}:`, e.message);
          }
        }
      }

      await Promise.all(Array.from({ length: concurrency }, worker));

      // Pause between batches
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`Cleanup finished. Total success: ${deletedCount}, Total failures: ${failedCount}`);

  } catch (err) {
    console.error('Error during cleanup loop:', err);
  }
})();
