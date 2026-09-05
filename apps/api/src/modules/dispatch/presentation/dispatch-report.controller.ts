import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import type {
  DriverCashReport,
  FreightCollectionReport,
  PendingDispatchAgeReport,
  VehicleRunningReport,
} from '@tiles-erp/shared-types';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  DriverCashQuery,
  FreightCollectionQuery,
  PendingAgeingQuery,
  VehicleRunningQuery,
} from '../application/dispatch-report.handlers';

export class DispatchReportQueryDto {
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

@ApiTags('Dispatch')
@ApiBearerAuth()
@Controller('dispatch-reports')
export class DispatchReportController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('freight-collection')
  @RequirePermissions(PERMISSIONS.DISPATCH_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Freight per customer: charged, settled and still owed' })
  freightCollection(@Query() query: DispatchReportQueryDto): Promise<FreightCollectionReport> {
    return this.queryBus.execute(
      new FreightCollectionQuery(query.from, query.to, query.branchId),
    );
  }

  @Get('vehicles')
  @RequirePermissions(PERMISSIONS.DISPATCH_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Trips, distance, hire and freight per vehicle' })
  vehicles(@Query() query: DispatchReportQueryDto): Promise<VehicleRunningReport> {
    return this.queryBus.execute(new VehicleRunningQuery(query.from, query.to, query.branchId));
  }

  @Get('drivers')
  @RequirePermissions(PERMISSIONS.DISPATCH_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'What each driver collected against what reached the desk' })
  drivers(@Query() query: DispatchReportQueryDto): Promise<DriverCashReport> {
    return this.queryBus.execute(new DriverCashQuery(query.from, query.to, query.branchId));
  }

  @Get('pending-ageing')
  @RequirePermissions(PERMISSIONS.DISPATCH_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Posted invoices with goods still in the godown, aged' })
  pendingAgeing(@Query() query: DispatchReportQueryDto): Promise<PendingDispatchAgeReport> {
    return this.queryBus.execute(new PendingAgeingQuery(query.branchId));
  }
}
