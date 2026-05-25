const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Intercept requests if needed, but we don't need to.
  // We will set the referer to match github.io
  await page.setExtraHTTPHeaders({
    'Referer': 'https://iceqube-cdo.github.io/'
  });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://maps.googleapis.com/maps/api/js?key=AIzaSyC6JwFLApTP1XlzZVn_E7SAl2ezmrm2_zg&libraries=places"></script>
    </head>
    <body>
      <div id="map" style="display:none;"></div>
      <script>
        function run() {
            const map = new google.maps.Map(document.getElementById('map'), {
                center: {lat: 8.4879555, lng: 124.6394541},
                zoom: 18
            });
            const lat = 8.4772; // Let's use the actual center from the map, wait...
            const lng = 124.6459;
            // The screenshot shows ZZ LOFT, Yellow Apartment, Green Village.
            // Let's search using Places Text Search to find ZZ LOFT first to get exact coordinates.
            const placesService = new google.maps.places.PlacesService(map);
            placesService.textSearch({ query: "ZZ LOFT Cagayan de Oro" }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    const loc = results[0].geometry.location;
                    console.log("Found ZZ LOFT at: " + loc.lat() + ", " + loc.lng());
                    
                    // Now do nearbySearch
                    placesService.nearbySearch({
                        location: loc,
                        radius: 40
                    }, (nResults, nStatus) => {
                        console.log("NearbySearch status: " + nStatus);
                        if (nResults) {
                            nResults.forEach(r => {
                                console.log("NEARBY: " + r.name + " | types: " + r.types.join(','));
                            });
                        }
                    });
                    
                    const geocoder = new google.maps.Geocoder();
                    geocoder.geocode({ location: loc }, (gResults, gStatus) => {
                        console.log("Geocoder status: " + gStatus);
                        if (gResults) {
                            gResults.forEach(r => {
                                console.log("GEOCODE: " + r.formatted_address + " | types: " + r.types.join(','));
                            });
                        }
                    });
                } else {
                    console.log("ZZ LOFT TextSearch failed: " + status);
                }
            });
        }
        window.onload = run;
      </script>
    </body>
    </html>
  `;
  
  await page.setContent(html);
  
  // wait a few seconds for API calls to finish
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
})();
