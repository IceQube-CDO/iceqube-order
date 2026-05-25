const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log('PAGE LOG:', msg.text());
  });

  console.log('Navigating...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const results = await page.evaluate(async () => {
    return new Promise((resolve) => {
        if (!window.google || !google.maps || !google.maps.places) {
            resolve({ error: "Google Maps API not loaded" });
            return;
        }
        
        const mapDiv = document.createElement('div');
        const map = new google.maps.Map(mapDiv, { center: {lat: 8.4879, lng: 124.6468}, zoom: 15 });
        const placesService = new google.maps.places.PlacesService(map);
        
        // Use the exact coordinates from the screenshot (approximate for ZZ Loft: 8.487920, 124.646850 - wait, I need exact)
        // Let's just do a text search for ZZ Loft to get its coords, then do nearbySearch
        placesService.textSearch({ query: 'ZZ LOFT Cagayan de Oro' }, (res, status) => {
            if (status !== 'OK' || !res || res.length === 0) {
                resolve({ error: 'Text search failed: ' + status });
                return;
            }
            
            const loc = res[0].geometry.location;
            
            placesService.nearbySearch({
                location: loc,
                radius: 40
            }, (nearbyRes, nearbyStatus) => {
                if (nearbyStatus === 'OK') {
                    resolve({
                        textSearchPlace: res[0].name,
                        nearbyResults: nearbyRes.map(r => ({ name: r.name, types: r.types }))
                    });
                } else {
                    resolve({ error: 'Nearby search failed: ' + nearbyStatus });
                }
            });
        });
    });
  });
  
  console.log("TEST RESULTS:", JSON.stringify(results, null, 2));
  
  await browser.close();
})();
