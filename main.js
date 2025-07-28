// main.js
mapboxgl.accessToken = 'pk.eyJ1IjoiYXRha2FuZSIsImEiOiJjbWNoNGUyNWkwcjFqMmxxdmVnb2tnMWJ4In0.xgo3tCNuq6kVXFYQpoS8PQ';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v10',
  center: [27.1428, 38.4192],
  zoom: 13
});

let mobileOffices = [];
let offices = [];
let currentLines = [];
let currentLabels = [];
let lastCenter = null;

function clearVisuals() {
  currentLines.forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  });
  currentLabels.forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  });
  currentLines = [];
  currentLabels = [];
}

function updateSpider(center) {
  const rounded = center.map(c => +c.toFixed(5));
  if (lastCenter && rounded[0] === lastCenter[0] && rounded[1] === lastCenter[1]) return;
  lastCenter = rounded;
  clearVisuals();

  const centerPoint = turf.point(center);

  const nearestMobiles = mobileOffices.map(f => ({
    feature: f,
    dist: turf.distance(centerPoint, f, { units: 'kilometers' })
  })).sort((a, b) => a.dist - b.dist).slice(0, 2);

  nearestMobiles.forEach((mob, i) => {
    const mobileCoord = mob.feature.geometry.coordinates;
    const mobilePoint = turf.point(mobileCoord);

    const nearestOffice = offices.map(f => ({
      feature: f,
      dist: turf.distance(mobilePoint, f, { units: 'kilometers' })
    })).sort((a, b) => a.dist - b.dist)[0];

    // Çizgi: Merkez → Mobil Ofis
    const line1Id = `line1-${i}`;
    const coords1 = [center, mobileCoord];
    const line1 = turf.lineString(coords1);

    map.addSource(line1Id, { type: 'geojson', data: line1 });
    map.addLayer({
      id: line1Id,
      type: 'line',
      source: line1Id,
      paint: {
        'line-color': '#3F51B5',
        'line-width': 2
      }
    });
    currentLines.push(line1Id);

    const mid1 = turf.midpoint(centerPoint, mobilePoint);
    const label1Id = `label1-${i}`;
    const label1 = {
      type: 'Feature',
      geometry: mid1.geometry,
      properties: {
        label: `Mobil Ofis\n${(mob.dist * 1000).toFixed(0)} m`
      }
    };
    map.addSource(label1Id, { type: 'geojson', data: label1 });
    map.addLayer({
      id: label1Id,
      type: 'symbol',
      source: label1Id,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-offset': [0, -1.5],
        'text-anchor': 'top'
      },
      paint: {
        'text-color': '#000',
        'text-halo-color': '#fff',
        'text-halo-width': 1
      }
    });
    currentLabels.push(label1Id);

    // Çizgi: Mobil Ofis → Ana Ofis
    const officeCoord = nearestOffice.feature.geometry.coordinates;
    const line2Id = `line2-${i}`;
    const coords2 = [mobileCoord, officeCoord];
    const line2 = turf.lineString(coords2);

    map.addSource(line2Id, { type: 'geojson', data: line2 });
    map.addLayer({
      id: line2Id,
      type: 'line',
      source: line2Id,
      paint: {
        'line-color': '#FF5722',
        'line-width': 2
      }
    });
    currentLines.push(line2Id);

    const mid2 = turf.midpoint(mobilePoint, turf.point(officeCoord));
    const label2Id = `label2-${i}`;
    const label2 = {
      type: 'Feature',
      geometry: mid2.geometry,
      properties: {
        label: `Ofis\n${(nearestOffice.dist * 1000).toFixed(0)} m`
      }
    };
    map.addSource(label2Id, { type: 'geojson', data: label2 });
    map.addLayer({
      id: label2Id,
      type: 'symbol',
      source: label2Id,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-offset': [0, -1.5],
        'text-anchor': 'top'
      },
      paint: {
        'text-color': '#000',
        'text-halo-color': '#fff',
        'text-halo-width': 1
      }
    });
    currentLabels.push(label2Id);
  });
}

map.on('load', () => {
  Promise.all([
    fetch('./data/mobilOfis.geojson').then(res => res.json()),
    fetch('./data/ofis.geojson').then(res => res.json())
  ]).then(([mobData, ofisData]) => {
    mobileOffices = mobData.features;
    offices = ofisData.features;

    map.addSource('mobiles', { type: 'geojson', data: mobData });
    map.addLayer({
      id: 'mobiles-layer',
      type: 'circle',
      source: 'mobiles',
      paint: {
        'circle-radius': 6,
        'circle-color': '#009688'
      }
    });

    map.addSource('offices', { type: 'geojson', data: ofisData });
    map.addLayer({
      id: 'offices-layer',
      type: 'circle',
      source: 'offices',
      paint: {
        'circle-radius': 6,
        'circle-color': '#FFC107'
      }
    });

    updateSpider([map.getCenter().lng, map.getCenter().lat]);
  });
});

let lastMove = 0;
map.on('move', () => {
  const now = Date.now();
  if (now - lastMove < 500) return;
  lastMove = now;

  const center = map.getCenter();
  updateSpider([center.lng, center.lat]);
});

map.on('contextmenu', e => {
  const features = map.queryRenderedFeatures(e.point, {
    layers: ['mobiles-layer', 'offices-layer']
  });

  if (features.length > 0) {
    const props = features[0].properties;
    const html = Object.entries(props).map(([k, v]) => `<b>${k}</b>: ${v}`).join('<br>');
    new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
  } else {
    new mapboxgl.Popup().setLngLat(e.lngLat).setHTML("Veri bulunamadı.").addTo(map);
  }
});
