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
import type {
  AuthenticatedUser,
  ConvertLeadResult,
  LeadItem,
  LeadStageSummary,
  Paginated,
} from '@tiles-erp/shared-types';
import type { PricingRights } from '../../sales/application/price-guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  ChangeLeadStageCommand,
  ConvertLeadCommand,
  CreateLeadCommand,
  DeleteLeadCommand,
  GetLeadQuery,
  LeadPipelineQuery,
  ListLeadsQuery,
  NextLeadCodeQuery,
  UpdateLeadCommand,
} from '../application/lead.handlers';
import type { LeadListFilter } from '../domain/lead.repository';
import {
  ChangeLeadStageDto,
  ConvertLeadDto,
  CreateLeadDto,
  LeadListQueryDto,
  UpdateLeadDto,
} from './dto/lead.dto';

/**
 * A lead is converted through the quotation desk, so the person doing it needs the same
 * pricing latitude the desk grants: whether they may quote below the branch minimum or
 * below cost. Credit is not part of a quotation, so no credit right is taken here.
 */
const pricingRights = (user: AuthenticatedUser): PricingRights => ({
  canOverridePrice:
    user.roles.includes('SUPER_ADMIN') ||
    user.permissions.includes(PERMISSIONS.QUOTATION_OVERRIDE_PRICE),
  canSellBelowCost:
    user.roles.includes('SUPER_ADMIN') || user.permissions.includes(PERMISSIONS.SELL_BELOW_COST),
  canOverrideCredit: false,
});

const filterFrom = (query: LeadListQueryDto): LeadListFilter => ({
  stage: query.stage,
  source: query.source,
  ownerUserId: query.ownerUserId,
  branchId: query.branchId,
  campaignId: query.campaignId,
  followUpDue: query.followUpDue,
});

@ApiTags('CRM Leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_LEAD_READ)
  @ApiOperation({ summary: 'List leads (search by name, company, code, phone, email or city)' })
  list(@Query() query: LeadListQueryDto): Promise<Paginated<LeadItem>> {
    return this.queryBus.execute(new ListLeadsQuery(query, filterFrom(query)));
  }

  @Get('pipeline')
  @RequirePermissions(PERMISSIONS.CRM_LEAD_READ)
  @ApiOperation({ summary: 'Lead counts and weighted value by stage, for the pipeline board' })
  pipeline(@Query() query: LeadListQueryDto): Promise<LeadStageSummary[]> {
    return this.queryBus.execute(new LeadPipelineQuery(filterFrom(query)));
  }

  @Get('next-code')
  @RequirePermissions(PERMISSIONS.CRM_LEAD_READ)
  @ApiOperation({ summary: 'Suggest the next sequential lead code' })
  nextCode(): Promise<string> {
    return this.queryBus.execute(new NextLeadCodeQuery());
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_LEAD_READ)
  @ApiOperation({ summary: 'Get a lead by id' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<LeadItem> {
    return this.queryBus.execute(new GetLeadQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CRM_LEAD_CREATE)
  @ApiOperation({ summary: 'Create a lead' })
  create(@Body() dto: CreateLeadDto, @CurrentUser('id') actorId: string): Promise<LeadItem> {
    return this.commandBus.execute(new CreateLeadCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_LEAD_UPDATE)
  @ApiOperation({ summary: 'Update a lead (optimistic concurrency via version)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('id') actorId: string,
  ): Promise<LeadItem> {
    return this.commandBus.execute(new UpdateLeadCommand(id, dto, actorId));
  }

  @Patch(':id/stage')
  @RequirePermissions(PERMISSIONS.CRM_LEAD_UPDATE)
  @ApiOperation({ summary: 'Move a lead along the pipeline (not the quoted stage)' })
  changeStage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeLeadStageDto,
    @CurrentUser('id') actorId: string,
  ): Promise<LeadItem> {
    return this.commandBus.execute(new ChangeLeadStageCommand(id, dto, actorId));
  }

  @Post(':id/convert')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CRM_LEAD_CONVERT)
  @ApiOperation({ summary: 'Convert a lead into a draft quotation on the quotation desk' })
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ConvertLeadResult> {
    return this.commandBus.execute(new ConvertLeadCommand(id, dto, user.id, pricingRights(user)));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CRM_LEAD_DELETE)
  @ApiOperation({ summary: 'Soft-delete a lead' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteLeadCommand(id, actorId));
    return { success: true };
  }
}
