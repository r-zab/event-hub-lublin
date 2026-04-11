import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { EventItem, GeoJsonFeatureCollection } from "@/data/mockData";

// ---------------------------------------------------------------------------
// Obsługa stref czasowych — Single Source of Truth
//
// Strategia: baza trzyma UTC, wyświetlamy w Europe/Warsaw.
// Backend (Pydantic naive datetime) serializuje BEZ 'Z', np. "2026-04-10T14:00:00".
// JS traktuje string bez strefy jako czas LOKALNY — stąd błąd +2h przy wyświetlaniu.
// Rozwiązanie: parseUTC() dodaje 'Z' do stringów bez strefy → JS poprawnie czyta UTC.
// ---------------------------------------------------------------------------

/** Parsuje string ISO z API jako UTC (dodaje Z jeśli brak strefy). */
export function parseUTC(utcStr: string): Date {
  const hasZone = utcStr.endsWith('Z') || utcStr.includes('+') || /[+-]\d{2}:\d{2}$/.test(utcStr);
  return new Date(hasZone ? utcStr : utcStr + 'Z');
}

/**
 * Konwertuje UTC string z API na format dla input[type=datetime-local]: YYYY-MM-DDTHH:mm
 * Przykład: "2026-04-10T12:00:00" (UTC) → "2026-04-10T14:00" (CEST Warsaw)
 */
export function toLocalISO(utcStr: string): string {
  return parseUTC(utcStr).toLocaleString('sv').replace(' ', 'T').slice(0, 16);
}

/**
 * Konwertuje czas lokalny z input[type=datetime-local] na UTC ISO string dla API.
 * Przykład: "2026-04-10T14:00" (Warsaw) → "2026-04-10T12:00:00.000Z"
 */
export function toUTCISO(localStr: string): string {
  return new Date(localStr).toISOString();
}

/** Formatuje UTC datetime string jako datę w pl-PL. */
export function formatDate(utcStr: string): string {
  return parseUTC(utcStr).toLocaleDateString('pl-PL');
}

/** Formatuje UTC datetime string jako datę i czas w pl-PL (z opcjami Intl). */
export function formatDateTime(
  utcStr: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return parseUTC(utcStr).toLocaleString('pl-PL', options);
}

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
    (seg as GeoJsonFeatureCollection).type === "FeatureCollection" &&
    Array.isArray((seg as GeoJsonFeatureCollection).features) &&
    (seg as GeoJsonFeatureCollection).features.length > 0
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
