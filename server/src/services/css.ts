import { CUSTOM_CSS_MAX_BYTES } from '@travel-plan/shared';

export interface SanitizeResult {
  css: string;
  removed: string[];
}

const SCOPE = '#trip-root';

/**
 * Sanitize + scope custom_css before it is stored/served (T3 is public-facing).
 *  - strip @import and @charset
 *  - strip </style> / <style and other tag-breakouts
 *  - strip expression()/javascript: and behavior:
 *  - reject editor/app-chrome-targeting selectors (rescope everything under #trip-root)
 *  - size-cap
 * Returns the scoped CSS plus a list of what was removed (for tests/feedback).
 */
export function sanitizeCustomCss(input: string, maxBytes = CUSTOM_CSS_MAX_BYTES): SanitizeResult {
  const removed: string[] = [];
  let css = input ?? '';

  // size cap (hard)
  if (Buffer.byteLength(css, 'utf8') > maxBytes) {
    css = Buffer.from(css, 'utf8').subarray(0, maxBytes).toString('utf8');
    removed.push('size-cap');
  }

  // strip tag breakouts. Remove <script>/<style> blocks WHOLE (including inner
  // text, so it can't leak into a following selector), then any stray tag.
  if (/<\s*\/?\s*(style|script)/i.test(css) || /<[^>]*>/.test(css)) {
    css = css.replace(/<script[\s\S]*?<\/script>/gi, '');
    css = css.replace(/<style[\s\S]*?<\/style>/gi, '');
    css = css.replace(/<[^>]*>/g, '');
    removed.push('tag-breakout');
  }

  // strip @import / @charset
  if (/@import/i.test(css)) {
    css = css.replace(/@import[^;]*;?/gi, '');
    removed.push('@import');
  }
  if (/@charset/i.test(css)) {
    css = css.replace(/@charset[^;]*;?/gi, '');
    removed.push('@charset');
  }

  // strip dangerous value patterns
  if (/expression\s*\(/i.test(css)) {
    css = css.replace(/expression\s*\([^)]*\)/gi, '');
    removed.push('expression()');
  }
  if (/javascript:/i.test(css)) {
    css = css.replace(/javascript:/gi, '');
    removed.push('javascript:');
  }
  if (/behavior\s*:/i.test(css)) {
    css = css.replace(/behavior\s*:[^;]*;?/gi, '');
    removed.push('behavior:');
  }

  // scope: prefix every top-level selector with #trip-root unless already scoped.
  const scoped = scopeCss(css, removed);

  return { css: scoped.css.trim(), removed: Array.from(new Set(removed)) };
}

/**
 * Rescope all rules under #trip-root. A naive but robust block parser:
 * splits top-level rule blocks and prefixes their selector lists. At-rules
 * with nested blocks (@media/@supports) have their inner selectors scoped.
 */
function scopeCss(css: string, removed: string[]): { css: string } {
  let out = '';
  let i = 0;
  const n = css.length;

  function readBlock(start: number): { selector: string; body: string; end: number } | null {
    let depth = 0;
    let braceStart = -1;
    for (let k = start; k < n; k++) {
      const ch = css[k];
      if (ch === '{') {
        if (depth === 0) braceStart = k;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return { selector: css.slice(start, braceStart), body: css.slice(braceStart + 1, k), end: k + 1 };
        }
      }
    }
    return null;
  }

  while (i < n) {
    // skip whitespace
    while (i < n && /\s/.test(css[i])) i++;
    if (i >= n) break;

    const block = readBlock(i);
    if (!block) break;

    const selector = block.selector.trim();
    if (/^@(media|supports|container)/i.test(selector)) {
      // scope inner rules of the at-rule
      out += `${selector} {\n${scopeCss(block.body, removed).css}\n}\n`;
    } else if (/^@/.test(selector)) {
      // keyframes / font-face etc. — keep as-is (already de-fanged above)
      out += `${selector} {${block.body}}\n`;
    } else {
      const scopedSel = selector
        .split(',')
        .map((s) => prefixSelector(s.trim(), removed))
        .join(', ');
      out += `${scopedSel} {${block.body}}\n`;
    }
    i = block.end;
  }
  return { css: out };
}

function prefixSelector(sel: string, removed: string[]): string {
  if (!sel) return sel;
  // already scoped
  if (sel === SCOPE || sel.startsWith(`${SCOPE} `) || sel.startsWith(`${SCOPE}.`) || sel.startsWith(`${SCOPE}:`)) {
    return sel;
  }
  // Reject attempts to escape the wrapper or hit app chrome / the whole page.
  if (/^(html|body|:root|\*)\b/i.test(sel) || /\.tp-editor|#app-chrome|#editor/i.test(sel)) {
    removed.push('escaping-selector');
  }
  return `${SCOPE} ${sel}`;
}
