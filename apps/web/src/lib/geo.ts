export type LatLng = { lat: number; lng: number };

/** Sheikh Zayed — used when the browser can't share a location. */
export const DEFAULT_LOCATION: LatLng = { lat: 30.0444, lng: 30.9851 };

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** Rough walking time at ~4.8 km/h, used for "8 min walk". */
export function walkingMinutes(km: number): number {
  return Math.max(1, Math.round((km / 4.8) * 60));
}

export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  const k = Math.min(1, Math.max(0, t));
  return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k };
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}
