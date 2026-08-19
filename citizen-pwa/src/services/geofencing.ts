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

// Dynamic venue calibration generator around a central lat/lng coordinate
export function createVenueCalibration(centerLat: number, centerLng: number, radiusMeters: number = 120): VenueCalibration {
  // 1 degree latitude ~ 111,320 meters
  // 1 degree longitude ~ 111,320 * cos(lat)
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));

  return {
    topLeftLatLng: { lat: centerLat + latDelta, lng: centerLng - lngDelta },
    bottomRightLatLng: { lat: centerLat - latDelta, lng: centerLng + lngDelta }
  };
}

// Calibrated around user live coordinates (20.5479, 86.0004) with generous ~250m venue perimeter
export const DEMO_CALIBRATION: VenueCalibration = createVenueCalibration(20.5479, 86.0004, 125);

/**
 * Starts real-time location tracking using the browser's native watchPosition API.
 * Requests permission implicitly upon calling with high accuracy hardware satellite fixes.
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
      enableHighAccuracy: true,
      maximumAge: 0,     // Fresh real-time satellite updates
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
 * Checks if the user is inside or near a zone and evaluates proximity to danger zones.
 */
export function checkGeofenceProximity(
  userLocation: Location,
  zones: Zone[],
  venueCalibration: VenueCalibration,
  activeZoneRisks: ZoneRisk[]
) {
  let inDangerZone = false;
  let nearestDangerZoneId: string | null = null;
  let minDangerDistanceMeters: number | null = null;

  let currentZoneId: string | null = null;
  let nearestZoneId: string | null = null;
  let minZoneDistanceMeters: number | null = null;

  for (const zone of zones) {
    const risk = activeZoneRisks.find(r => r.zone_id === zone.zone_id);
    const isDanger = risk && (risk.risk_level === 'high' || risk.risk_level === 'critical');

    const bounds = interpolateBounds(zone.bounds_normalized, venueCalibration);
    const minLat = Math.min(bounds.lat_min, bounds.lat_max);
    const maxLat = Math.max(bounds.lat_min, bounds.lat_max);
    const minLng = Math.min(bounds.lng_min, bounds.lng_max);
    const maxLng = Math.max(bounds.lng_min, bounds.lng_max);

    const isInside =
      userLocation.lat >= minLat && userLocation.lat <= maxLat &&
      userLocation.lng >= minLng && userLocation.lng <= maxLng;

    const centroidLat = (minLat + maxLat) / 2;
    const centroidLng = (minLng + maxLng) / 2;
    const distance = getDistanceFromLatLonInMeters(userLocation.lat, userLocation.lng, centroidLat, centroidLng);

    if (isInside) {
      currentZoneId = zone.zone_id;
      if (isDanger) {
        inDangerZone = true;
        nearestDangerZoneId = zone.zone_id;
        minDangerDistanceMeters = 0;
      }
    }

    const formatStableDistance = (dist: number) => {
      if (dist < 8) return Math.round(dist);
      if (dist < 50) return Math.round(dist / 5) * 5;
      return Math.round(dist / 10) * 10;
    };

    if (isDanger) {
      if (minDangerDistanceMeters === null || distance < minDangerDistanceMeters) {
        minDangerDistanceMeters = isInside ? 0 : formatStableDistance(distance);
        nearestDangerZoneId = zone.zone_id;
      }
    }

    if (minZoneDistanceMeters === null || distance < minZoneDistanceMeters) {
      minZoneDistanceMeters = isInside ? 0 : formatStableDistance(distance);
      nearestZoneId = zone.zone_id;
    }
  }

  return {
    inDangerZone,
    nearestDangerZoneId,
    distanceMeters: minDangerDistanceMeters,
    nearestZoneId: nearestZoneId || (zones.length > 0 ? zones[0].zone_id : null),
    nearestZoneDistanceMeters: minZoneDistanceMeters,
    currentZoneId
  };
}
