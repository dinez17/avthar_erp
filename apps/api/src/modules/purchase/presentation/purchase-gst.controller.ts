import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import type { PurchaseGstSummary, TaxPosition } from '@tiles-erp/shared-types';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import {
  PurchaseGstSummaryQuery,
  TaxPositionQuery,
} from '../application/purchase-gst.handlers';

export class PurchaseGstQueryDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to the 1st of this month' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to now' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}

@ApiTags('Purchase')
@ApiBearerAuth()
@Controller('purchase-gst')
export class PurchaseGstController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.GST_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Inward supplies by GST rate, HSN and supplier' })
  summary(@Query() query: PurchaseGstQueryDto): Promise<PurchaseGstSummary> {
    return this.queryBus.execute(
      new PurchaseGstSummaryQuery(query.from, query.to, query.branchId),
    );
  }

  @Get('position')
  @RequirePermissions(PERMISSIONS.GST_REPORT_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Output tax against input credit, netted head by head' })
  position(@Query() query: PurchaseGstQueryDto): Promise<TaxPosition> {
    return this.queryBus.execute(new TaxPositionQuery(query.from, query.to, query.branchId));
  }
}
