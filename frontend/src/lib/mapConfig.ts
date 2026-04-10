import { LatLngBoundsLiteral } from 'leaflet';

/** Przybliżony bounding box administracyjny Lublina. */
export const LUBLIN_BOUNDS: LatLngBoundsLiteral = [
  [51.120, 22.420], // South-West
  [51.350, 22.690], // North-East
];

/** Minimalny zoom — obejmuje cały obszar miasta. */
export const MIN_ZOOM = 11;
