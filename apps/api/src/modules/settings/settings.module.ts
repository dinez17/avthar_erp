import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SETTINGS_REPOSITORY } from './domain/settings.repository';
import { PrismaSettingsRepository } from './infrastructure/prisma-settings.repository';
import { SettingsController } from './presentation/settings.controller';
import { NumberSeriesController } from './presentation/number-series.controller';
import { ListSettingsHandler, UpdateSettingHandler } from './application/settings.handlers';

/** Application settings: admin-managed key-value configuration. */
@Module({
  imports: [CqrsModule],
  controllers: [SettingsController, NumberSeriesController],
  providers: [
    { provide: SETTINGS_REPOSITORY, useClass: PrismaSettingsRepository },
    ListSettingsHandler,
    UpdateSettingHandler,
  ],
})
export class SettingsModule {}
