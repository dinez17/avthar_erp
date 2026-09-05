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
import type { Paginated, RoleListItem } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../core/http/dto/pagination-query.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateRoleCommand } from '../application/commands/create-role.command';
import { DeleteRoleCommand } from '../application/commands/delete-role.command';
import { UpdateRoleCommand } from '../application/commands/update-role.command';
import { ListPermissionsQuery } from '../application/queries/list-permissions.query';
import { ListRolesQuery } from '../application/queries/list-roles.query';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @ApiOperation({ summary: 'List roles (paginated, searchable)' })
  list(@Query() query: PaginationQueryDto): Promise<Paginated<RoleListItem>> {
    return this.queryBus.execute(new ListRolesQuery(query));
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLE_READ)
  @ApiOperation({ summary: 'List every registered permission code' })
  permissions(): Promise<string[]> {
    return this.queryBus.execute(new ListPermissionsQuery());
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLE_CREATE)
  @ApiOperation({ summary: 'Create a role' })
  create(@Body() dto: CreateRoleDto, @CurrentUser('id') actorId: string): Promise<RoleListItem> {
    return this.commandBus.execute(
      new CreateRoleCommand(
        {
          name: dto.name,
          description: dto.description ?? null,
          permissionCodes: dto.permissionCodes,
          isSalesRole: dto.isSalesRole ?? false,
        },
        actorId,
      ),
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLE_UPDATE)
  @ApiOperation({ summary: 'Update a role (optimistic concurrency via version)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser('id') actorId: string,
  ): Promise<RoleListItem> {
    return this.commandBus.execute(new UpdateRoleCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROLE_DELETE)
  @ApiOperation({ summary: 'Soft-delete a role (blocked for system roles / roles in use)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteRoleCommand(id, actorId));
    return { success: true };
  }
}
