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
    console.log('Starting targeted index-based update to set is_real = false for configs...');
    let totalUpdated = 0;

    for (const key of configKeys) {
      console.log(`Processing key: ${key}`);
      
      while (true) {
        // Fetch up to 100 IDs for this specific config key that have is_real = true
        const fetchUrl = `${SUPABASE_URL}/rest/v1/orders?order_id=eq.${key}&is_real=eq.true&select=id&limit=100`;
        const res = await fetch(fetchUrl, {
          headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`
          }
        });

        if (!res.ok) {
          console.error(`Fetch failed for ${key}:`, res.status);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }

        const rows = await res.json();
        if (!rows || rows.length === 0) {
          console.log(`No more active rows for ${key}`);
          break;
        }

        console.log(`Found ${rows.length} rows to update for ${key}`);

        // Update in a single request by ID
        const ids = rows.map(r => r.id);
        const updateUrl = `${SUPABASE_URL}/rest/v1/orders?id=in.(${ids.join(',')})`;
        const updateRes = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ is_real: false })
        });

        if (updateRes.ok) {
          totalUpdated += rows.length;
          console.log(`Successfully updated ${rows.length} rows for ${key} (Total: ${totalUpdated})`);
        } else {
          const err = await updateRes.text();
          console.error(`Update failed for ${key}:`, updateRes.status, err);
          await new Promise(r => setTimeout(r, 2000));
        }

        // Slight pause
        await new Promise(r => setTimeout(r, 200));
      }
    }

    console.log(`Targeted update finished. Total rows marked as is_real=false: ${totalUpdated}`);
  } catch (err) {
    console.error('Error during targeted update:', err);
  }
})();
