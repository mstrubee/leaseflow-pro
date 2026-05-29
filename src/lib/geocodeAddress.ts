export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

/**
 * Geocodifica una dirección chilena usando Nominatim (OpenStreetMap).
 * Devuelve null si no encuentra resultado.
 */
export async function geocodeAddress(
  street: string,
  number: string,
  commune: string,
  region: string,
  country = "Chile",
): Promise<GeocodeResult | null> {
  const parts = [
    street && number ? `${street} ${number}` : street,
    commune,
    region,
    country,
  ].filter(Boolean);

  if (parts.length < 2) return null;

  const q = encodeURIComponent(parts.join(", "));
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=${q}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "es", "User-Agent": "LeaseFlowPro/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return null;
  }
}
