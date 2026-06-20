import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ThemeRow } from '@travel-plan/shared';

interface ThemeProviderProps {
  theme: ThemeRow | null;
  children: ReactNode;
}

const FONT_LINK_ID = 'tp-font-link';

/**
 * Applies a ThemeRow as CSS custom properties + fonts + scoped custom_css on a
 * `#trip-root` wrapper. The stable theming hooks (.tp-* classes, data-*) all
 * live under this element so Claude-generated custom_css can target them.
 */
export default function ThemeProvider({ theme, children }: ThemeProviderProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layout = theme?.layout ?? null;

  // Apply design tokens + fonts to the #trip-root element.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const appliedKeys: string[] = [];

    if (theme) {
      for (const [key, value] of Object.entries(theme.tokens)) {
        const prop = key.startsWith('--') ? key : `--${key}`;
        el.style.setProperty(prop, value);
        appliedKeys.push(prop);
      }
      if (theme.fonts.display) {
        el.style.setProperty('--font-display', theme.fonts.display);
        appliedKeys.push('--font-display');
      }
      if (theme.fonts.body) {
        el.style.setProperty('--font-body', theme.fonts.body);
        appliedKeys.push('--font-body');
      }
      if (theme.fonts.mono) {
        el.style.setProperty('--font-mono', theme.fonts.mono);
        appliedKeys.push('--font-mono');
      }
    }

    return () => {
      for (const prop of appliedKeys) el.style.removeProperty(prop);
    };
  }, [theme]);

  // Inject the font stylesheet <link> into <head> (deduped by href).
  useEffect(() => {
    const url = theme?.fonts.url;
    if (!url) return;

    let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
    const created = !link;
    if (!link) {
      link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== url) link.href = url;

    return () => {
      if (created && link && link.parentNode) link.parentNode.removeChild(link);
    };
  }, [theme?.fonts.url]);

  // Inject custom_css INSIDE the wrapper so scoping under #trip-root holds.
  const customCss = theme?.custom_css ?? '';

  return (
    <div
      id="trip-root"
      ref={rootRef}
      className="tp-root"
      data-hero-variant={layout?.heroVariant}
      data-day-style={layout?.dayStyle}
      data-density={layout?.density}
    >
      {customCss ? (
        // eslint-disable-next-line react/no-danger
        <style id="tp-custom-css" dangerouslySetInnerHTML={{ __html: customCss }} />
      ) : null}
      {children}
    </div>
  );
}
