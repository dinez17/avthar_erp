import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingItem } from '@tiles-erp/shared-types';
import { apiFetch } from '../../lib/api-client';

const KEY = 'settings';

export function useSettings() {
  return useQuery({
    queryKey: [KEY],
    queryFn: () => apiFetch<SettingItem[]>('/settings'),
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value, version }: { key: string; value: string; version: number }) =>
      apiFetch<SettingItem>(`/settings/${encodeURIComponent(key)}`, {
        method: 'PATCH',
        body: JSON.stringify({ value, version }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
