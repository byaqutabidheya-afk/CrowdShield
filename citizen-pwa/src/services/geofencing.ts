import type { Location, ZoneRisk } from '../store/appStore';

export interface BoundsNormalized {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export interface Zone {
  zone_id: string;
  bounds_normalized: BoundsNormalized;
}

export interface VenueCalibration {
  topLeftLatLng: Location;
  bottomRightLatLng: Location;
}

// Hardcoded for the hackathon demo based on the venue's approximate bounds.
export const DEMO_CALIBRATION: VenueCalibration = {
  topLeftLatLng: { lat: 20.345, lng: 85.806 },
  bottomRightLatLng: { lat: 20.344, lng: 85.807 }
};

/**
 * Starts real-time location tracking using the browser's native watchPosition API.
 * Requests permission implicitly upon calling.
 * 
 * @param onLocationUpdate - Callback fired on new position
 * @param onPermissionDenied - Callback fired if user denies permission
 * @returns A cleanup function to stop tracking
 */
export function startLocationTracking(
  onLocationUpdate: (loc: Location) => void,
  onPermissionDenied: () => void
): () => void {
  if (!('geolocation' in navigator)) {
    console.warn('Geolocation not supported by this browser.');
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onLocationUpdate({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
    },
    (error) => {
      if (error.code === error.PERMISSION_DENIED) {
        onPermissionDenied();
      } else {
        console.warn('Geolocation watchPosition error:', error.message);
      }
    },
    {
      enableHighAccuracy: false, // Sufficient for venue-scale approximation
      maximumAge: 5000,          // Reuse positions up to 5 seconds old
      timeout: 10000
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

/**
 * Converts a real-world lat/lng coordinate into the 0-1 normalized map space 
 * using the inverse of the venue calibration linear-interpolation.
 */
export function latLngToNormalized(
  location: Location,
  calibration: VenueCalibration
): { x: number, y: number } {
  const { topLeftLatLng: tl, bottomRightLatLng: br } = calibration;
  
  const y = (location.lat - tl.lat) / (br.lat - tl.lat);
  const x = (location.lng - tl.lng) / (br.lng - tl.lng);

  return { x, y };
}

/**
 * Converts a normalized coordinate (0 to 1) into a real-world lat/lng.
 * 
 * DESIGN NOTE:
 * This assumes a roughly rectangular, axis-aligned venue footprint. 
 * This is a pragmatic approximation appropriate for a hackathon demo scope, 
 * rather than a full geodetic projection (which would handle curved earth and arbitrary rotation).
 * Matches the calibration approach described in the venue GPS calibration notes.
 */
export function interpolateBounds(
  bounds: BoundsNormalized,
  calibration: VenueCalibration
) {
  const { topLeftLatLng: tl, bottomRightLatLng: br } = calibration;
  
  // y=0 is top (North), y=1 is bottom (South)
  const lat_max = tl.lat + bounds.y_min * (br.lat - tl.lat); // Northern edge
  const lat_min = tl.lat + bounds.y_max * (br.lat - tl.lat); // Southern edge
  
  // x=0 is left (West), x=1 is right (East)
  const lng_min = tl.lng + bounds.x_min * (br.lng - tl.lng); // Western edge
  const lng_max = tl.lng + bounds.x_max * (br.lng - tl.lng); // Eastern edge
  
  return {
    lat_min,
    lat_max,
    lng_min,
    lng_max
  };
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

/**
 * Computes distance between two coordinates in meters using the Haversine formula.
 */
function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Radius of the earth in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

/**
 * Checks if the user is inside or near a high/critical risk zone.
 */
export function checkGeofenceProximity(
  userLocation: Location,
  zones: Zone[],
  venueCalibration: VenueCalibration,
  activeZoneRisks: ZoneRisk[]
) {
  let inDangerZone = false;
  let nearestDangerZoneId: string | null = null;
  let minDistanceMeters: number | null = null;

  for (const zone of zones) {
    const risk = activeZoneRisks.find(r => r.zone_id === zone.zone_id);
    if (!risk || (risk.risk_level !== 'high' && risk.risk_level !== 'critical')) {
      continue;
    }

    const { lat_min, lat_max, lng_min, lng_max } = interpolateBounds(zone.bounds_normalized, venueCalibration);

    // a) Check if user falls inside the approximate zone bounds
    if (
      userLocation.lat >= lat_min && userLocation.lat <= lat_max &&
      userLocation.lng >= lng_min && userLocation.lng <= lng_max
    ) {
      inDangerZone = true;
      nearestDangerZoneId = zone.zone_id;
      minDistanceMeters = 0;
      break; // Short-circuit: we found they are currently in a danger zone
    } else {
      // b) Compute distance to the centroid for proximity warning
      const centroidLat = (lat_min + lat_max) / 2;
      const centroidLng = (lng_min + lng_max) / 2;
      const distance = getDistanceFromLatLonInMeters(userLocation.lat, userLocation.lng, centroidLat, centroidLng);
      
      if (minDistanceMeters === null || distance < minDistanceMeters) {
        minDistanceMeters = distance;
        nearestDangerZoneId = zone.zone_id;
      }
    }
  }

  return {
    inDangerZone,
    nearestDangerZoneId,
    distanceMeters: minDistanceMeters
  };
}
