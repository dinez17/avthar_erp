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
import type { DepartmentListItem, Paginated } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../core/http/dto/pagination-query.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreateDepartmentCommand } from '../application/commands/create-department.command';
import { DeleteDepartmentCommand } from '../application/commands/delete-department.command';
import { UpdateDepartmentCommand } from '../application/commands/update-department.command';
import { ListDepartmentsQuery } from '../application/queries/list-departments.query';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('Departments')
@ApiBearerAuth()
@Controller('departments')
export class DepartmentsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.DEPARTMENT_READ)
  @ApiOperation({ summary: 'List departments (paginated, searchable)' })
  list(@Query() query: PaginationQueryDto): Promise<Paginated<DepartmentListItem>> {
    return this.queryBus.execute(new ListDepartmentsQuery(query));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.DEPARTMENT_CREATE)
  @ApiOperation({ summary: 'Create a department' })
  create(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser('id') actorId: string,
  ): Promise<DepartmentListItem> {
    return this.commandBus.execute(
      new CreateDepartmentCommand(
        { name: dto.name, description: dto.description ?? null, isActive: dto.isActive },
        actorId,
      ),
    );
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.DEPARTMENT_UPDATE)
  @ApiOperation({ summary: 'Update a department (optimistic concurrency via version)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser('id') actorId: string,
  ): Promise<DepartmentListItem> {
    return this.commandBus.execute(new UpdateDepartmentCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.DEPARTMENT_DELETE)
  @ApiOperation({ summary: 'Soft-delete a department (blocked while users are assigned)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteDepartmentCommand(id, actorId));
    return { success: true };
  }
}
