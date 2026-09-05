# Keyboard shortcuts

Counter staff work faster on the keyboard than the mouse, so data entry is built around
two app-wide behaviours. Both live in `@tiles-erp/ui` and are mounted once per app in
`src/app/AppProviders.tsx`.

## Enter — move to the next field

`EnterKeyNavigation` moves focus to the next field instead of submitting the form, and
selects the text there so typing overwrites it.

Exceptions, by design:

- a textarea keeps Enter for new lines;
- an open dropdown keeps Enter for choosing the highlighted option;
- buttons are never a landing target, so Enter can never fire a delete or a save by
  accident;
- Ctrl / Alt / Shift / Meta + Enter are left to the browser;
- focus stays inside a dialog while one is open.

## Ctrl+S — save the current screen

`SaveShortcut` is the single listener; screens opt in with the `useSaveShortcut` hook:

```tsx
// A page: always active while the page is mounted.
useSaveShortcut(() => void save());

// A dialog: only while it is open, so it never steals the shortcut from the page.
useSaveShortcut(() => void submit(), open);
```

Registrations form a stack, so a dialog opened over a page takes the shortcut until it
closes and then hands it back. The browser's own "save page" dialog is suppressed only
when a screen is actually listening.

### Where it is wired

| Screen                                                                    | Action           |
| ------------------------------------------------------------------------- | ---------------- |
| Users, Roles, Departments, Companies/Branches/Godowns/Gates/Racks, Categories/Brands/Series/Collections, Products, Customers/Suppliers, Transporters/Vehicles/Drivers | Save the open dialog |
| Purchase orders, Goods receipts, Purchase invoices, Purchase returns       | Post the open dialog |
| Stock entry, Stock transfer, Bulk create, Sales invoice, Receipt           | Post the open dialog |
| Stock count, Purchase rates, Selling prices, Quotation entry, Profile      | Save the page    |

Settings is deliberately excluded: each setting row saves itself, so a single page-level
save would be ambiguous.

## Adding the shortcut to a new screen

1. Import the hook: `import { useSaveShortcut } from '@tiles-erp/ui';`
2. Call it after the handler it wraps, passing an `enabled` flag for dialogs.

Nothing else is required — the listener is already mounted.

See also `QUANTITY_DISPLAY.md` for the box/pieces rule that applies to every screen.
