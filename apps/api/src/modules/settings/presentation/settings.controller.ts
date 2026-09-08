import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type { BrandingInfo, SettingItem } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import {
  GetBrandingQuery,
  ListSettingsQuery,
  UpdateSettingCommand,
} from '../application/settings.handlers';
import { UpdateSettingDto } from './dto/update-setting.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * Public on purpose: the login screen has to render the company's name and logo
   * before anyone has a token, and a salesman without SETTINGS_MANAGE still sees
   * the branded shell. Only those two values are exposed, never the settings table.
   *
   * Declared before the parameterised routes so "branding" is never read as a key.
   */
  @Public()
  @Get('branding')
  @ApiOperation({ summary: 'Application name and logo, for unauthenticated screens' })
  branding(): Promise<BrandingInfo> {
    return this.queryBus.execute(new GetBrandingQuery());
  }

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'List all application settings' })
  list(): Promise<SettingItem[]> {
    return this.queryBus.execute(new ListSettingsQuery());
  }

  @Patch(':key')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Update a setting value (optimistic concurrency via version)' })
  update(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser('id') actorId: string,
  ): Promise<SettingItem> {
    return this.commandBus.execute(new UpdateSettingCommand(key, dto.value, dto.version, actorId));
  }
}
