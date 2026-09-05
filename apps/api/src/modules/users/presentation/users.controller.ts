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
import type { Paginated, SalesmanItem, UserListItem } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../core/http/dto/pagination-query.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateUserCommand } from '../application/commands/create-user.command';
import { DeleteUserCommand } from '../application/commands/delete-user.command';
import { UpdateUserCommand } from '../application/commands/update-user.command';
import { GetUserQuery } from '../application/queries/get-user.query';
import { ListSalesmenQuery, ListUsersQuery } from '../application/queries/list-users.query';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'List users (paginated, searchable)' })
  list(@Query() query: PaginationQueryDto): Promise<Paginated<UserListItem>> {
    return this.queryBus.execute(new ListUsersQuery(query));
  }

  @Get('salesmen')
  @RequirePermissions(PERMISSIONS.QUOTATION_READ)
  @ApiOperation({ summary: 'Active users holding a sales role' })
  salesmen(): Promise<SalesmanItem[]> {
    return this.queryBus.execute(new ListSalesmenQuery());
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_READ)
  @ApiOperation({ summary: 'Get a user by id' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<UserListItem> {
    return this.queryBus.execute(new GetUserQuery(id));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_CREATE)
  @ApiOperation({ summary: 'Create a user' })
  create(@Body() dto: CreateUserDto, @CurrentUser('id') actorId: string): Promise<UserListItem> {
    return this.commandBus.execute(new CreateUserCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_UPDATE)
  @ApiOperation({ summary: 'Update a user (optimistic concurrency via version)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: string,
  ): Promise<UserListItem> {
    return this.commandBus.execute(new UpdateUserCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.USER_DELETE)
  @ApiOperation({ summary: 'Soft-delete a user' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteUserCommand(id, actorId));
    return { success: true };
  }
}
