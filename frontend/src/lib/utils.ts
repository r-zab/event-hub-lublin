import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { EventItem, GeoJsonFeatureCollection } from "@/data/mockData";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function parseHouseNumber(raw: string): [number, string] {
  const normalized = raw.trim().toUpperCase();
  const match = normalized.match(/^(\d+)([A-Z]?)$/);
  if (match) return [parseInt(match[1], 10), match[2]];
  return [0, normalized];
}

function sortHouseNumbers(nums: string[]): string[] {
  return [...nums].sort((a, b) => {
    const [an, al] = parseHouseNumber(a);
    const [bn, bl] = parseHouseNumber(b);
    if (an !== bn) return an - bn;
    return al.localeCompare(bl);
  });
}

/**
 * Returns the house numbers string for an event.
 * If geojson_segment is a FeatureCollection, extracts house_number from each
 * feature's properties and returns a sorted, comma-separated list (e.g. "3, 5, 13").
 * Falls back to house_number_from–house_number_to from the event fields.
 */
export function formatEventNumbers(event: EventItem): string {
  const seg = event.geojson_segment;
  if (
    seg &&
    typeof seg === "object" &&
    !Array.isArray(seg) &&
    (seg as GeoJsonFeatureCollection).type === "FeatureCollection"
  ) {
    const fc = seg as GeoJsonFeatureCollection;
    const nums = fc.features
      .map((f) => f.properties?.house_number as string | undefined)
      .filter((n): n is string => Boolean(n));
    if (nums.length > 0) {
      return sortHouseNumbers(nums).join(", ");
    }
  }
  if (!event.house_number_from && !event.house_number_to) return "";
  if (event.house_number_from === event.house_number_to) return event.house_number_from;
  return `${event.house_number_from}–${event.house_number_to}`;
}
