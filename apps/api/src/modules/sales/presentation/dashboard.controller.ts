import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import type { DashboardSummary, Gstr1Return, GstSummary } from '@tiles-erp/shared-types';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import { DashboardSummaryQuery } from '../application/dashboard.handlers';
import { Gstr1ReturnQuery, GstSummaryQuery } from '../application/gst.handlers';
import { buildGstr1Workbook } from '../infrastructure/gstr1-workbook';

export class DashboardQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to 30 days ago' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to today' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Sales, collections, outstanding and stock at a glance' })
  summary(@Query() query: DashboardQueryDto): Promise<DashboardSummary> {
    return this.queryBus.execute(new DashboardSummaryQuery(query.from, query.to, query.branchId));
  }

  @Get('gst-summary')
  @RequirePermissions(PERMISSIONS.GST_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Outward supplies by GST rate, HSN and place of supply' })
  gstSummary(@Query() query: DashboardQueryDto): Promise<GstSummary> {
    return this.queryBus.execute(new GstSummaryQuery(query.from, query.to, query.branchId));
  }

  @Get('gstr1')
  @RequirePermissions(PERMISSIONS.GST_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'GSTR-1 sections as JSON, for on-screen review and CSV export' })
  gstr1(@Query() query: DashboardQueryDto): Promise<Gstr1Return> {
    return this.queryBus.execute(new Gstr1ReturnQuery(query.from, query.to, query.branchId));
  }

  @Get('gstr1.xlsx')
  @RequirePermissions(PERMISSIONS.GST_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOperation({ summary: 'The GSTR-1 workbook the offline tool uploads' })
  async gstr1Workbook(
    @Query() query: DashboardQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const data: Gstr1Return = await this.queryBus.execute(
      new Gstr1ReturnQuery(query.from, query.to, query.branchId),
    );
    const period = data.fromDate.slice(0, 7);
    response.setHeader('Content-Disposition', `attachment; filename="GSTR1-${period}.xlsx"`);
    response.end(await buildGstr1Workbook(data));
  }
}
