import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

const KEY = 'tiles-erp:selected-branch';

const read = (): string => {
  try {
    return window.sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * A branch filter shared by every list and report in this browser tab.
 *
 * Session storage intentionally forgets the choice when the tab/session ends. Each page
 * still validates the restored id against the signed-in user's allowed branches before
 * making a request, so persistence never widens branch access.
 */
export function useSessionBranchId(): [string, Dispatch<SetStateAction<string>>] {
  const [branchId, setValue] = useState(read);
  const setBranchId = useCallback<Dispatch<SetStateAction<string>>>((next) => {
    setValue((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      try {
        if (value) window.sessionStorage.setItem(KEY, value);
        else window.sessionStorage.removeItem(KEY);
      } catch {
        // Storage can be disabled; the filter still works for the current page.
      }
      return value;
    });
  }, []);
  return [branchId, setBranchId];
}
