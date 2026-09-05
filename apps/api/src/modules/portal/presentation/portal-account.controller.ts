import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@tiles-erp/config';
import type { Paginated, PortalAccountCreated, PortalAccountItem } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CreatePortalAccountCommand,
  DeletePortalAccountCommand,
  ListPortalAccountsQuery,
  SetPortalAccountActiveCommand,
} from '../application/portal-account.handlers';
import {
  CreatePortalAccountDto,
  PortalAccountListQueryDto,
  SetPortalAccountActiveDto,
} from './dto/portal.dto';

/** Admin-side provisioning of portal logins. Gated by a permission, unlike the portal itself. */
@ApiTags('Portal access')
@ApiBearerAuth()
@Controller('portal-accounts')
export class PortalAccountController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PORTAL_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'List portal logins; filter by party type, supplier or active' })
  list(@Query() query: PortalAccountListQueryDto): Promise<Paginated<PortalAccountItem>> {
    return this.queryBus.execute(
      new ListPortalAccountsQuery(query, {
        partyType: query.partyType,
        supplierId: query.supplierId,
        isActive: query.isActive,
      }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PORTAL_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Grant a party a portal login (creates or links a user)' })
  create(
    @Body() dto: CreatePortalAccountDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PortalAccountCreated> {
    return this.commandBus.execute(new CreatePortalAccountCommand(dto, actorId));
  }

  @Patch(':id/active')
  @RequirePermissions(PERMISSIONS.PORTAL_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Enable or disable a portal login' })
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPortalAccountActiveDto,
    @CurrentUser('id') actorId: string,
  ): Promise<PortalAccountItem> {
    return this.commandBus.execute(new SetPortalAccountActiveCommand(id, dto.isActive, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PORTAL_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Revoke a portal login' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeletePortalAccountCommand(id, actorId));
    return { success: true };
  }
}
