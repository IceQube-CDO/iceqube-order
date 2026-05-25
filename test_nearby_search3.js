const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/Digital%20Architecture/IceQubeCDO-App/', { waitUntil: 'networkidle0' });
  
  await page.waitForFunction(() => window.google && google.maps && google.maps.places, { timeout: 10000 });
  
  const results = await page.evaluate(async () => {
    return new Promise((resolve) => {
        const mapDiv = document.createElement('div');
        const map = new google.maps.Map(mapDiv, { center: {lat: 8.487920, lng: 124.646850}, zoom: 15 });
        const placesService = new google.maps.places.PlacesService(map);
        
        placesService.nearbySearch({
            location: {lat: 8.487920, lng: 124.646850},
            radius: 100
        }, (nearbyRes, nearbyStatus) => {
            resolve({
                status: nearbyStatus,
                results: nearbyRes ? nearbyRes.map(r => ({ name: r.name, types: r.types })) : null
            });
        });
    });
  });
  
  console.log("TEST RESULTS:", JSON.stringify(results, null, 2));
  await browser.close();
})();
