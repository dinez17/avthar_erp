import type { SettingItem, UUID } from '@tiles-erp/shared-types';

export const SETTINGS_REPOSITORY = Symbol('SETTINGS_REPOSITORY');

/** Port for application-setting persistence. */
export interface SettingsRepository {
  listAll(): Promise<SettingItem[]>;
  updateValue(key: string, value: string, version: number, updatedBy: UUID): Promise<SettingItem>;
}
