import React from 'react';
import {
  TriangleAlert,
  Wrench,
  CalendarClock,
  Droplets,
  Waves,
  Shovel,
  Flame,
  HardHat,
  Hammer,
  Truck,
  Zap,
  Thermometer,
  CircleAlert,
  Lock,
  Info,
  Gauge,
  TrafficCone,
  Pipette,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// BrushCleaning nie istnieje w zainstalowanej wersji lucide-react (0.462) —
// używamy oryginalnnych ścieżek SVG z oficjalnej ikony Lucide BrushCleaning
const BrushCleaningIcon: LucideIcon = ({ size = 24, strokeWidth = 2.2, color = 'currentColor', className, style, ...props }) =>
  React.createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className,
      style,
      ...props,
    },
    React.createElement('path', { d: 'm16 22-1-4' }),
    React.createElement('path', { d: 'M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1' }),
    React.createElement('path', { d: 'M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z' }),
    React.createElement('path', { d: 'm8 22 1-4' }),
  );

export interface IconEntry {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** SVG inner content (paths/circles) used by Leaflet divIcon — no outer <svg> tag */
  svgInner: string;
}

export const EVENT_TYPE_ICONS: IconEntry[] = [
  {
    key: 'alert_triangle',
    label: 'Awaria',
    Icon: TriangleAlert,
    svgInner:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
  },
  {
    key: 'wrench',
    label: 'Naprawa',
    Icon: Wrench,
    svgInner:
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>',
  },
  {
    key: 'calendar_clock',
    label: 'Wyłączenie',
    Icon: CalendarClock,
    svgInner:
      '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"></path><path d="M16 2v4"></path><path d="M8 2v4"></path><path d="M3 10h5"></path><path d="M17.5 17.5 16 16.3V14"></path><circle cx="16" cy="16" r="6"></circle>',
  },
  {
    key: 'droplets',
    label: 'Woda',
    Icon: Droplets,
    svgInner:
      '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"></path><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"></path>',
  },
  {
    key: 'waves',
    label: 'Kanalizacja',
    Icon: Waves,
    svgInner:
      '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path>',
  },
  {
    key: 'gauge',
    label: 'Ciśnienie',
    Icon: Gauge,
    svgInner:
      '<path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path>',
  },
  {
    key: 'thermometer',
    label: 'Temperatura',
    Icon: Thermometer,
    svgInner:
      '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>',
  },
  {
    key: 'shovel',
    label: 'Prace ziemne',
    Icon: Shovel,
    svgInner:
      '<path d="M2 22v-5l5-5 5 5-5 5z"></path><path d="M9.5 14.5 16 8"></path><path d="m17 2 5 5-.5.5a3.53 3.53 0 0 1-5 0s0 0 0 0a3.53 3.53 0 0 1 0-5L17 2"></path>',
  },
  {
    key: 'hard_hat',
    label: 'Budowa',
    Icon: HardHat,
    svgInner:
      '<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"></path><path d="M14 6a6 6 0 0 1 6 6v3"></path><path d="M4 15v-3a6 6 0 0 1 6-6"></path><rect x="2" y="15" width="20" height="4" rx="1"></rect>',
  },
  {
    key: 'hammer',
    label: 'Roboty',
    Icon: Hammer,
    svgInner:
      '<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"></path><path d="m18 15 4-4"></path><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"></path>',
  },
  {
    key: 'traffic_cone',
    label: 'Oznakowanie',
    Icon: TrafficCone,
    svgInner:
      '<path d="M9.3 6.2a4.55 4.55 0 0 0 5.4 0"></path><path d="M7.9 10.7c.9.8 2.4 1.3 4.1 1.3s3.2-.5 4.1-1.3"></path><path d="M13.9 3.5a1.93 1.93 0 0 0-3.8-.1l-3 10c-.1.2-.1.4-.1.6 0 1.7 2.2 3 5 3s5-1.3 5-3c0-.2 0-.4-.1-.5Z"></path><path d="m7.5 12.2-4.7 2.7c-.5.3-.8.7-.8 1.1s.3.8.8 1.1l7.6 4.5c.9.5 2.1.5 3 0l7.6-4.5c.7-.3 1-.7 1-1.1s-.3-.8-.8-1.1l-4.7-2.8"></path>',
  },
  {
    key: 'truck',
    label: 'Transport',
    Icon: Truck,
    svgInner:
      '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path><path d="M15 18H9"></path><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path><circle cx="17" cy="18" r="2"></circle><circle cx="7" cy="18" r="2"></circle>',
  },
  {
    key: 'flame',
    label: 'Zagrożenie',
    Icon: Flame,
    svgInner:
      '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>',
  },
  {
    key: 'zap',
    label: 'El. / Pompy',
    Icon: Zap,
    svgInner:
      '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>',
  },
  {
    key: 'circle_alert',
    label: 'Ostrzeżenie',
    Icon: CircleAlert,
    svgInner:
      '<circle cx="12" cy="12" r="10"></circle><line x1="12" x2="12" y1="8" y2="12"></line><line x1="12" x2="12.01" y1="16" y2="16"></line>',
  },
  {
    key: 'lock',
    label: 'Zamknięcie',
    Icon: Lock,
    svgInner:
      '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
  },
  {
    key: 'pipette',
    label: 'Jakość wody',
    Icon: Pipette,
    svgInner:
      '<path d="m2 22 1-1h3l9-9"></path><path d="M3 21v-3l9-9"></path><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"></path>',
  },
  {
    key: 'brush_cleaning',
    label: 'Czyszczenie',
    Icon: BrushCleaningIcon,
    svgInner:
      '<path d="m16 22-1-4"></path><path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"></path><path d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z"></path><path d="m8 22 1-4"></path>',
  },
  {
    key: 'sparkles',
    label: 'Ogólne / inne',
    Icon: Sparkles,
    svgInner:
      '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path><path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path>',
  },
  {
    key: 'info',
    label: 'Informacja',
    Icon: Info,
    svgInner:
      '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
  },
];

const ICON_MAP = new Map(EVENT_TYPE_ICONS.map((e) => [e.key, e]));

export function resolveIcon(key: string | null | undefined): LucideIcon {
  return ICON_MAP.get(key ?? '')?.Icon ?? TriangleAlert;
}

export function resolveIconSvg(key: string | null | undefined): string {
  return ICON_MAP.get(key ?? '')?.svgInner ?? ICON_MAP.get('alert_triangle')!.svgInner;
}
