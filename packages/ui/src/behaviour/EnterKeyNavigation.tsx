import { useEffect } from 'react';

/**
 * Controls Enter can move between. Buttons are deliberately excluded so Enter can never
 * land on — and then fire — a destructive action such as a row delete.
 */
const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',
  'select',
  'textarea',
  '[role="combobox"]',
].join(', ');

const isTypeable = (element: HTMLElement): boolean => {
  const tag = element.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (element as HTMLInputElement).type;
    return type !== 'checkbox' && type !== 'radio' && type !== 'file';
  }
  return tag === 'select' || tag === 'textarea' || element.getAttribute('role') === 'combobox';
};

const isReachable = (element: HTMLElement): boolean =>
  !element.hasAttribute('disabled') &&
  element.getAttribute('aria-disabled') !== 'true' &&
  element.getAttribute('aria-hidden') !== 'true' &&
  element.tabIndex !== -1 &&
  element.getClientRects().length > 0;

/**
 * Data-entry keyboard behaviour used across the whole app: Enter advances to the next
 * field rather than submitting the form, matching the counter software staff come from.
 *
 * Deliberate exceptions:
 *  - a textarea keeps Enter for new lines;
 *  - an open dropdown keeps Enter for choosing the highlighted option;
 *  - modifier combinations (Ctrl/Alt/Shift/Meta + Enter) are left alone.
 *
 * Focus stays inside the dialog when one is open, and the next field's text is selected
 * so typing overwrites it.
 */
export function EnterKeyNavigation(): null {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.defaultPrevented || event.isComposing) return;

      const target = event.target as HTMLElement | null;
      if (!target || target.isContentEditable) return;
      if (target.tagName.toLowerCase() === 'textarea') return;
      if (!target.matches(FIELD_SELECTOR) || !isTypeable(target)) return;
      // An open listbox owns Enter: it commits the highlighted option instead.
      if (target.getAttribute('aria-expanded') === 'true') return;

      const scope = target.closest<HTMLElement>('[role="dialog"]') ?? document.body;
      const fields = Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR)).filter(
        (element) => isTypeable(element) && isReachable(element),
      );
      const position = fields.indexOf(target);
      const next = position === -1 ? undefined : fields[position + 1];
      if (!next) return;

      // Stop the implicit form submit that Enter would otherwise trigger.
      event.preventDefault();
      next.focus();
      if (next instanceof HTMLInputElement && next.type !== 'date' && next.type !== 'time') {
        next.select();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return null;
}
