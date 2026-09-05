import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import type { SettingItem, UUID } from '@tiles-erp/shared-types';
import { SETTINGS_REPOSITORY, type SettingsRepository } from '../domain/settings.repository';

export class ListSettingsQuery {}

export class UpdateSettingCommand {
  constructor(
    public readonly key: string,
    public readonly value: string,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListSettingsQuery)
export class ListSettingsHandler implements IQueryHandler<ListSettingsQuery, SettingItem[]> {
  constructor(@Inject(SETTINGS_REPOSITORY) private readonly settings: SettingsRepository) {}

  execute(): Promise<SettingItem[]> {
    return this.settings.listAll();
  }
}

@CommandHandler(UpdateSettingCommand)
export class UpdateSettingHandler implements ICommandHandler<UpdateSettingCommand, SettingItem> {
  constructor(@Inject(SETTINGS_REPOSITORY) private readonly settings: SettingsRepository) {}

  execute(command: UpdateSettingCommand): Promise<SettingItem> {
    return this.settings.updateValue(
      command.key,
      command.value,
      command.version,
      command.actorId,
    );
  }
}
