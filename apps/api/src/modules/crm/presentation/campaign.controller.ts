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
import type { CampaignItem, CampaignPerformanceRow, Paginated } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  CampaignPerformanceQuery,
  CreateCampaignCommand,
  DeleteCampaignCommand,
  GetCampaignQuery,
  ListCampaignsQuery,
  NextCampaignCodeQuery,
  UpdateCampaignCommand,
} from '../application/campaign.handlers';
import { CampaignListQueryDto, CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@ApiTags('CRM Marketing')
@ApiBearerAuth()
@Controller('campaigns')
export class CampaignController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CRM_CAMPAIGN_READ)
  @ApiOperation({ summary: 'List campaigns, newest first; filter by status or channel' })
  list(@Query() query: CampaignListQueryDto): Promise<Paginated<CampaignItem>> {
    return this.queryBus.execute(
      new ListCampaignsQuery(query, { status: query.status, channel: query.channel }),
    );
  }

  @Get('performance')
  @RequirePermissions(PERMISSIONS.CRM_CAMPAIGN_READ)
  @ApiOperation({ summary: 'Per-campaign leads, conversions, cost per lead and ROI' })
  performance(): Promise<CampaignPerformanceRow[]> {
    return this.queryBus.execute(new CampaignPerformanceQuery());
  }

  @Get('next-code')
  @RequirePermissions(PERMISSIONS.CRM_CAMPAIGN_READ)
  @ApiOperation({ summary: 'Suggest the next sequential campaign code' })
  nextCode(): Promise<string> {
    return this.queryBus.execute(new NextCampaignCodeQuery());
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CRM_CAMPAIGN_READ)
  @ApiOperation({ summary: 'Get a campaign by id' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CampaignItem> {
    return this.queryBus.execute(new GetCampaignQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.CRM_CAMPAIGN_CREATE)
  @ApiOperation({ summary: 'Create a campaign' })
  create(@Body() dto: CreateCampaignDto, @CurrentUser('id') actorId: string): Promise<CampaignItem> {
    return this.commandBus.execute(new CreateCampaignCommand(dto, actorId));
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CRM_CAMPAIGN_UPDATE)
  @ApiOperation({ summary: 'Update a campaign (optimistic concurrency via version)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CampaignItem> {
    return this.commandBus.execute(new UpdateCampaignCommand(id, dto, actorId));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.CRM_CAMPAIGN_DELETE)
  @ApiOperation({ summary: 'Soft-delete a campaign' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: boolean }> {
    await this.commandBus.execute(new DeleteCampaignCommand(id, actorId));
    return { success: true };
  }
}
