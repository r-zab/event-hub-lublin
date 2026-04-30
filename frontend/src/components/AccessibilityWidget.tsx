import { useEffect, useState, useCallback } from 'react';
import { Accessibility } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const LS_FONT = 'mpwik-a11y-font-size';
const LS_CONTRAST = 'mpwik-a11y-contrast';

type FontSize = 'default' | 'large' | 'xlarge';
type ContrastTheme = 'default' | 'hc-bw' | 'hc-by' | 'hc-yb';

const FONT_LEVELS: { id: FontSize; px: string; title: string }[] = [
  { id: 'default', px: '14px', title: 'Domyślny rozmiar czcionki' },
  { id: 'large',   px: '18px', title: 'Duży rozmiar czcionki' },
  { id: 'xlarge',  px: '22px', title: 'Bardzo duży rozmiar czcionki' },
];

const CONTRAST_OPTIONS: { id: ContrastTheme; title: string; bg: string; fg: string; border: string }[] = [
  { id: 'default', title: 'Kontrast domyślny',          bg: '#f0f4fb', fg: '#1c3c66', border: '#c5d5e8' },
  { id: 'hc-bw',   title: 'Biały tekst na czarnym tle', bg: '#000000', fg: '#ffffff', border: '#ffffff' },
  { id: 'hc-by',   title: 'Czarny tekst na żółtym tle', bg: '#ffff00', fg: '#000000', border: '#000000' },
  { id: 'hc-yb',   title: 'Żółty tekst na czarnym tle', bg: '#000000', fg: '#ffff00', border: '#ffff00' },
];

function applyFontSize(size: FontSize) {
  const sizeMap: Record<FontSize, string> = { default: '', large: '18px', xlarge: '20px' };
  const px = sizeMap[size];
  if (px) {
    document.documentElement.style.fontSize = px;
  } else {
    document.documentElement.style.removeProperty('font-size');
  }
}

function applyContrast(theme: ContrastTheme) {
  if (theme === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

interface AccessibilityWidgetProps {
  triggerClassName?: string;
  align?: 'start' | 'center' | 'end';
}

export function AccessibilityWidget({ triggerClassName, align = 'end' }: AccessibilityWidgetProps) {
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (localStorage.getItem(LS_FONT) as FontSize) || 'default'
  );
  const [contrast, setContrast] = useState<ContrastTheme>(
    () => (localStorage.getItem(LS_CONTRAST) as ContrastTheme) || 'default'
  );

  useEffect(() => { applyFontSize(fontSize); }, [fontSize]);
  useEffect(() => { applyContrast(contrast); }, [contrast]);

  const handleFontSize = useCallback((size: FontSize) => {
    setFontSize(size);
    localStorage.setItem(LS_FONT, size);
  }, []);

  const handleContrast = useCallback((theme: ContrastTheme) => {
    setContrast(theme);
    localStorage.setItem(LS_CONTRAST, theme);
  }, []);

  const handleReset = useCallback(() => {
    handleFontSize('default');
    handleContrast('default');
  }, [handleFontSize, handleContrast]);

  const isActive = fontSize !== 'default' || contrast !== 'default';
  const activeLabel = CONTRAST_OPTIONS.find(o => o.id === contrast)?.title ?? 'Kontrast domyślny';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Panel dostępności (WCAG) — aktywny: ${activeLabel}`}
          title="Ustawienia dostępności (WCAG)"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
            triggerClassName
          )}
        >
          <Accessibility className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only sm:inline">Dostępność</span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-72 p-4" align={align} sideOffset={6}>
        <h2 className="font-heading font-semibold text-sm mb-4">Ustawienia dostępności</h2>

        <section aria-labelledby="a11y-font-label" className="mb-5">
          <h3
            id="a11y-font-label"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2"
          >
            Rozmiar czcionki
          </h3>
          <div className="flex gap-2" role="group" aria-label="Wybierz rozmiar czcionki">
            {FONT_LEVELS.map(({ id, px, title }) => (
              <button
                key={id}
                onClick={() => handleFontSize(id)}
                aria-label={title}
                aria-pressed={fontSize === id}
                title={title}
                className={cn(
                  'flex-1 rounded-md border-2 py-2.5 font-bold transition-colors leading-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  fontSize === id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                style={{ fontSize: px }}
              >
                A
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="a11y-contrast-label" className="mb-4">
          <h3
            id="a11y-contrast-label"
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2"
          >
            Tryb kontrastowy
          </h3>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Wybierz tryb kontrastowy">
            {CONTRAST_OPTIONS.map(({ id, title, bg, fg, border }) => (
              <button
                key={id}
                onClick={() => handleContrast(id)}
                aria-label={title}
                aria-pressed={contrast === id}
                title={title}
                className={cn(
                  'aspect-square rounded-md flex items-center justify-center font-bold text-base transition-transform',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'hover:scale-105',
                  contrast === id && 'ring-2 ring-primary ring-offset-2 scale-105'
                )}
                style={{ backgroundColor: bg, color: fg, border: `2px solid ${border}` }}
              >
                A
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground text-center" aria-live="polite">
            {activeLabel}
          </p>
        </section>

        {isActive && (
          <button
            onClick={handleReset}
            className={cn(
              'w-full rounded-md border border-border py-1.5 text-xs text-muted-foreground',
              'hover:bg-accent hover:text-foreground transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            Przywróć ustawienia domyślne
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
