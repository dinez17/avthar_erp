import { Injectable } from '@nestjs/common';
import type { Setting } from '@prisma/client';
import { ConflictError, NotFoundError } from '@tiles-erp/shared';
import type { SettingItem, UUID } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { SettingsRepository } from '../domain/settings.repository';

const toItem = (s: Setting): SettingItem => ({
  key: s.key,
  value: s.value,
  description: s.description,
  updatedAt: s.updatedAt.toISOString(),
  version: s.version,
});

@Injectable()
export class PrismaSettingsRepository implements SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(): Promise<SettingItem[]> {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return rows.map(toItem);
  }

  async updateValue(
    key: string,
    value: string,
    version: number,
    updatedBy: UUID,
  ): Promise<SettingItem> {
    const updated = await this.prisma.setting.updateMany({
      where: { key, version },
      data: { value, updatedBy, version: { increment: 1 } },
    });
    if (updated.count === 0) {
      const exists = await this.prisma.setting.findUnique({ where: { key } });
      if (!exists) throw new NotFoundError(`Setting "${key}" not found`);
      throw new ConflictError('Setting was modified by someone else. Reload and retry.');
    }
    const row = await this.prisma.setting.findUniqueOrThrow({ where: { key } });
    return toItem(row);
  }
}
