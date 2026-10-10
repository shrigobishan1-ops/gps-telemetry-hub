/**
 * GPS Telemetry Hub - Client Controller (Google Maps Edition)
 * Manages Google Maps, WebSockets, Route Polyline, and Geolocation
 */

const INITIAL_COORDS = { lat: 6.927100, lng: 79.861200 };

let map;
let marker;
let routePolyline;
const routeHistory = [];

// Jitter filter state
let lastValidPos = null;
const MIN_DISTANCE_METERS = 3; // Ignore movements smaller than 3 meters

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#4b687a" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#023e58" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#283d6a" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] }
];

document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  initSimulationControls();
});

/**
 * Google Maps Async Callback
 */
async function initMap() {
  try {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    map = new google.maps.Map(document.getElementById("map"), {
      zoom: 14,
      center: INITIAL_COORDS,
      mapId: "DEMO_MAP_ID",
      disableDefaultUI: true,
      zoomControl: true
    });

    const markerDiv = document.createElement("div");
    markerDiv.className = "custom-google-marker";

    marker = new AdvancedMarkerElement({
      map: map,
      position: INITIAL_COORDS,
      content: markerDiv,
      title: "GPS Tracker Location"
    });

    routePolyline = new google.maps.Polyline({
      strokeColor: '#0a84ff',
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: map
    });

    addPointToRouteHistory(INITIAL_COORDS.lat, INITIAL_COORDS.lng);

  } catch (err) {
    console.error('[Error] Google Maps initialization failed:', err);
  }
}

/**
 * Updates UI Cards and Map Marker when telemetry data arrives
 */
function updateTelemetry(lat, lng, metadata = {}) {
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);

  if (isNaN(parsedLat) || isNaN(parsedLng)) return;

  setTextContent('val-lat', parsedLat.toFixed(6));
  setTextContent('val-lng', parsedLng.toFixed(6));

  const now = new Date();
  setTextContent('val-time', now.toLocaleTimeString());
  setTextContent('val-date', now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }));

  if (metadata.speed) setTextContent('val-speed-tag', metadata.speed);
  if (metadata.sats) setTextContent('map-sats', metadata.sats);
  if (metadata.heading) setTextContent('map-heading', metadata.heading);

  if (map && marker) {
    const newPos = { lat: parsedLat, lng: parsedLng };
    marker.position = newPos;
    map.panTo(newPos);

    addPointToRouteHistory(parsedLat, parsedLng);
  }
}

function addPointToRouteHistory(lat, lng) {
  routeHistory.push({ lat, lng });
  if (routePolyline) {
    routePolyline.setPath(routeHistory);
  }
}

function initWebSocket() {
  if (!window.location.host) return;

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}`;

  try {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setConnectionStatus('Connected (Live)', 'ok');
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.lat && payload.lng) {
          updateTelemetry(payload.lat, payload.lng, payload);
        }
      } catch (e) {
        console.warn('Non-JSON payload:', event.data);
      }
    };
    ws.onerror = () => setConnectionStatus('Connection Error', 'error');
    ws.onclose = () => setConnectionStatus('Disconnected (Offline)', 'offline');
  } catch (err) {
    setConnectionStatus('Standby Mode', 'offline');
  }
}

function setConnectionStatus(message, state) {
  const badge = document.getElementById('connection-status');
  const label = document.getElementById('status-text');

  if (!badge || !label) return;

  label.textContent = message;

  if (state === 'ok') {
    badge.style.borderColor = 'rgba(48, 209, 88, 0.25)';
    badge.style.background = 'rgba(48, 209, 88, 0.12)';
    badge.style.color = 'var(--accent-green)';
  } else if (state === 'simulating') {
    badge.style.borderColor = 'rgba(255, 159, 10, 0.3)';
    badge.style.background = 'rgba(255, 159, 10, 0.12)';
    badge.style.color = 'var(--accent-orange)';
  } else {
    badge.style.borderColor = 'rgba(255, 69, 58, 0.3)';
    badge.style.background = 'rgba(255, 69, 58, 0.12)';
    badge.style.color = 'var(--accent-red)';
  }
}

/**
 * Geolocation Tracking & Controls with Jitter Filter
 */
function initSimulationControls() {
  const btnToggle = document.getElementById('btn-toggle-sim');
  const btnPing = document.getElementById('btn-ping-random');
  const simBadge = document.getElementById('sim-status-badge');

  let watchId = null;

  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        btnToggle.textContent = 'Start Live GPS Tracking';
        btnToggle.className = 'btn btn-primary';
        if (simBadge) {
          simBadge.textContent = 'Standby';
          simBadge.className = 'badge-tag sim-badge';
        }
        setConnectionStatus('Standby Mode', 'offline');
      } else {
        if (!navigator.geolocation) {
          alert("Geolocation is not supported by your browser");
          return;
        }

        btnToggle.textContent = 'Stop Live Tracking';
        btnToggle.className = 'btn btn-secondary';
        if (simBadge) {
          simBadge.textContent = 'Live GPS Active';
          simBadge.className = 'badge-tag status-ok';
        }
        setConnectionStatus('Tracking Live GPS...', 'ok');

        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const newPos = { lat: position.coords.latitude, lng: position.coords.longitude };

            // Apply Jitter Filter: Ignore movements smaller than 3 meters
            if (lastValidPos) {
              const distance = getDistanceFromLatLonInMeters(lastValidPos.lat, lastValidPos.lng, newPos.lat, newPos.lng);
              if (distance < MIN_DISTANCE_METERS) {
                return; // Skip update if standing still or minor jump
              }
            }

            lastValidPos = newPos;

            const speedKmh = position.coords.speed ? `${(position.coords.speed * 3.6).toFixed(1)} km/h` : '0.0 km/h';
            const accuracy = `± ${position.coords.accuracy.toFixed(1)}m`;

            updateTelemetry(newPos.lat, newPos.lng, {
              speed: speedKmh,
              sats: "Device GPS",
              heading: position.coords.heading ? `${position.coords.heading.toFixed(0)}°` : "N/A"
            });
            setTextContent('map-accuracy', accuracy);
          },
          (error) => {
            console.error("GPS Error:", error.message);
            alert("Error getting location. Make sure permissions are allowed.");
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
        );
      }
    });
  }

  if (btnPing) {
    btnPing.addEventListener('click', () => {
      const randomLat = INITIAL_COORDS.lat + (Math.random() - 0.5) * 0.01;
      const randomLng = INITIAL_COORDS.lng + (Math.random() - 0.5) * 0.01;
      const randomSpeed = `${(Math.random() * 40 + 10).toFixed(1)} km/h`;

      updateTelemetry(randomLat, randomLng, {
        speed: randomSpeed,
        sats: "11 Locked",
        heading: "140° SE"
      });
    });
  }
}

function setTextContent(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = text;
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}