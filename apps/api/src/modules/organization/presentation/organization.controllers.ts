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
import type { OrgNodeItem, Paginated } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  BulkCreateGatesCommand,
  BulkCreateRacksCommand,
  CreateBranchCommand,
  CreateCompanyCommand,
  CreateGateCommand,
  CreateGodownCommand,
  CreateRackCommand,
  DeleteBranchCommand,
  DeleteCompanyCommand,
  DeleteGateCommand,
  DeleteGodownCommand,
  DeleteRackCommand,
  UpdateBranchCommand,
  UpdateCompanyCommand,
  UpdateGateCommand,
  UpdateGodownCommand,
  UpdateRackCommand,
} from '../application/org-node.commands';
import {
  ListBranchesQuery,
  ListCompaniesQuery,
  ListGatesQuery,
  ListGodownsQuery,
  ListRacksQuery,
} from '../application/org-node.queries';
import {
  BulkCreateOrgNodesDto,
  CreateOrgNodeDto,
  OrgNodeListQueryDto,
  UpdateOrgNodeDto,
} from './dto/org-node.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANY_READ)
  @ApiOperation({ summary: 'List companies' })
  list(@Query() query: OrgNodeListQueryDto): Promise<Paginated<OrgNodeItem>> {
    return this.queryBus.execute(new ListCompaniesQuery(query));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPANY_CREATE)
  @ApiOperation({ summary: 'Create a company' })
  create(@Body() dto: CreateOrgNodeDto, @CurrentUser('id') actorId: string): Promise<OrgNodeItem> {
    return this.commandBus.execute(new CreateCompanyCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_UPDATE)
  @ApiOperation({ summary: 'Update a company' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgNodeDto,
    @CurrentUser('id') actorId: string,
  ): Promise<OrgNodeItem> {
    return this.commandBus.execute(new UpdateCompanyCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.COMPANY_DELETE)
  @ApiOperation({ summary: 'Soft-delete a company (blocked while branches exist)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteCompanyCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.BRANCH_READ)
  @ApiOperation({ summary: 'List branches (optionally filtered by company)' })
  list(@Query() query: OrgNodeListQueryDto): Promise<Paginated<OrgNodeItem>> {
    return this.queryBus.execute(new ListBranchesQuery(query, query.parentId));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.BRANCH_CREATE)
  @ApiOperation({ summary: 'Create a branch' })
  create(@Body() dto: CreateOrgNodeDto, @CurrentUser('id') actorId: string): Promise<OrgNodeItem> {
    return this.commandBus.execute(new CreateBranchCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.BRANCH_UPDATE)
  @ApiOperation({ summary: 'Update a branch' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgNodeDto,
    @CurrentUser('id') actorId: string,
  ): Promise<OrgNodeItem> {
    return this.commandBus.execute(new UpdateBranchCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.BRANCH_DELETE)
  @ApiOperation({ summary: 'Soft-delete a branch (blocked while godowns exist)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteBranchCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Godowns')
@ApiBearerAuth()
@Controller('godowns')
export class GodownsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.GODOWN_READ)
  @ApiOperation({ summary: 'List godowns (optionally filtered by branch)' })
  list(@Query() query: OrgNodeListQueryDto): Promise<Paginated<OrgNodeItem>> {
    return this.queryBus.execute(new ListGodownsQuery(query, query.parentId));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.GODOWN_CREATE)
  @ApiOperation({ summary: 'Create a godown' })
  create(@Body() dto: CreateOrgNodeDto, @CurrentUser('id') actorId: string): Promise<OrgNodeItem> {
    return this.commandBus.execute(new CreateGodownCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.GODOWN_UPDATE)
  @ApiOperation({ summary: 'Update a godown' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgNodeDto,
    @CurrentUser('id') actorId: string,
  ): Promise<OrgNodeItem> {
    return this.commandBus.execute(new UpdateGodownCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.GODOWN_DELETE)
  @ApiOperation({ summary: 'Soft-delete a godown (blocked while gates exist)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteGodownCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Gates')
@ApiBearerAuth()
@Controller('gates')
export class GatesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.GATE_READ)
  @ApiOperation({ summary: 'List gates (optionally filtered by godown)' })
  list(@Query() query: OrgNodeListQueryDto): Promise<Paginated<OrgNodeItem>> {
    return this.queryBus.execute(new ListGatesQuery(query, query.parentId));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.GATE_CREATE)
  @ApiOperation({ summary: 'Create a gate' })
  create(@Body() dto: CreateOrgNodeDto, @CurrentUser('id') actorId: string): Promise<OrgNodeItem> {
    return this.commandBus.execute(new CreateGateCommand(dto, actorId));
  }

  @Post('bulk')
  @RequirePermissions(PERMISSIONS.GATE_CREATE)
  @ApiOperation({ summary: 'Bulk-create gates under one godown (all-or-nothing)' })
  bulkCreate(
    @Body() dto: BulkCreateOrgNodesDto,
    @CurrentUser('id') actorId: string,
  ): Promise<OrgNodeItem[]> {
    return this.commandBus.execute(new BulkCreateGatesCommand(dto, actorId));
  }


  @Patch(':id')
  @RequirePermissions(PERMISSIONS.GATE_UPDATE)
  @ApiOperation({ summary: 'Update a gate' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgNodeDto,
    @CurrentUser('id') actorId: string,
  ): Promise<OrgNodeItem> {
    return this.commandBus.execute(new UpdateGateCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.GATE_DELETE)
  @ApiOperation({ summary: 'Soft-delete a gate (blocked while racks exist)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteGateCommand(id, actorId));
    return { success: true };
  }
}

@ApiTags('Racks')
@ApiBearerAuth()
@Controller('racks')
export class RacksController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RACK_READ)
  @ApiOperation({ summary: 'List racks (optionally filtered by gate)' })
  list(@Query() query: OrgNodeListQueryDto): Promise<Paginated<OrgNodeItem>> {
    return this.queryBus.execute(new ListRacksQuery(query, query.parentId));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RACK_CREATE)
  @ApiOperation({ summary: 'Create a rack' })
  create(@Body() dto: CreateOrgNodeDto, @CurrentUser('id') actorId: string): Promise<OrgNodeItem> {
    return this.commandBus.execute(new CreateRackCommand(dto, actorId));
  }

  @Post('bulk')
  @RequirePermissions(PERMISSIONS.RACK_CREATE)
  @ApiOperation({ summary: 'Bulk-create racks under one gate (all-or-nothing)' })
  bulkCreate(
    @Body() dto: BulkCreateOrgNodesDto,
    @CurrentUser('id') actorId: string,
  ): Promise<OrgNodeItem[]> {
    return this.commandBus.execute(new BulkCreateRacksCommand(dto, actorId));
  }


  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RACK_UPDATE)
  @ApiOperation({ summary: 'Update a rack' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrgNodeDto,
    @CurrentUser('id') actorId: string,
  ): Promise<OrgNodeItem> {
    return this.commandBus.execute(new UpdateRackCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.RACK_DELETE)
  @ApiOperation({ summary: 'Soft-delete a rack' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteRackCommand(id, actorId));
    return { success: true };
  }
}
