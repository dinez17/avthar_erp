/**
 * Chrome ignores `autocomplete="off"` on fields it believes hold a name, address or
 * phone number, and shows its own suggestion list over ours. An unrecognised token —
 * the documented MUI workaround — suppresses that heuristic.
 *
 * Spread into a TextField's `inputProps`, keeping any props the parent supplied:
 *
 *   <TextField {...params} inputProps={{ ...params.inputProps, ...NO_AUTOFILL }} />
 */
export const NO_AUTOFILL = {
  autoComplete: 'new-password',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
} as const;
