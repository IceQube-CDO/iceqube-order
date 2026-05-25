const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    // console.log('PAGE LOG:', msg.text());
  });

  await page.goto('http://localhost:3000/Digital%20Architecture/IceQubeCDO-App/', { waitUntil: 'networkidle0' });
  
  // Wait for Google Maps
  await page.waitForFunction(() => window.google && google.maps && google.maps.places, { timeout: 10000 });
  
  const results = await page.evaluate(async () => {
    return new Promise((resolve) => {
        const mapDiv = document.createElement('div');
        const map = new google.maps.Map(mapDiv, { center: {lat: 8.4879, lng: 124.6468}, zoom: 15 });
        const placesService = new google.maps.places.PlacesService(map);
        
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
