export interface OsrmLeg {
  duration: number;  // seconds
  distance: number;  // meters
}

export interface OsrmRoute {
  geometry: GeoJSON.LineString;
  legs: OsrmLeg[];
  duration: number;
  distance: number;
}

/**
 * Get road route between ordered waypoints using OSRM public API.
 * Returns null on failure (caller should fall back to straight line).
 */
export async function getOsrmRoute(
  waypoints: { lat: number; lng: number }[],
): Promise<OsrmRoute | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    return data.routes[0] as OsrmRoute;
  } catch {
    return null;
  }
}

/**
 * Estimate travel minutes between two points.
 * Uses 30 km/h for distances < 20km (urban), 100 km/h otherwise.
 */
export function estimateTravelMinutes(distanceKm: number): number {
  const speed = distanceKm < 20 ? 30 : 100;
  return Math.round((distanceKm / speed) * 60);
}
