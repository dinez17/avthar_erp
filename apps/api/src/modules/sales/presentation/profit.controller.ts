import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import type { ProfitGrouping, ProfitReport } from '@tiles-erp/shared-types';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { PROFIT_REPOSITORY, type ProfitRepository } from '../domain/profit.repository';

const GROUPINGS = ['INVOICE', 'PRODUCT', 'BRANCH', 'SALESMAN'] as const;

const monthStart = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
};

export class ProfitQueryDto {
  @ApiPropertyOptional({ enum: GROUPINGS, description: 'Defaults to INVOICE' })
  @IsIn(GROUPINGS)
  @IsOptional()
  grouping?: ProfitGrouping;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to the 1st of this month' })
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  salesmanUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  productId?: string;
}

/**
 * What was sold, what it cost, and the difference.
 *
 * Cost is the figure frozen on each line when its invoice was posted, so a report run
 * today for last quarter gives the same answer it gave then.
 */
@ApiTags('Sales')
@ApiBearerAuth()
@Controller('profit')
export class ProfitController {
  constructor(@Inject(PROFIT_REPOSITORY) private readonly profit: ProfitRepository) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROFIT_REPORT_READ)
  @ApiOperation({ summary: 'Margin over a period, grouped by invoice, product, branch or salesman' })
  report(@Query() query: ProfitQueryDto): Promise<ProfitReport> {
    return this.profit.report(query.grouping ?? 'INVOICE', {
      from: query.from ?? monthStart(),
      to: query.to ?? new Date().toISOString(),
      branchId: query.branchId,
      salesmanUserId: query.salesmanUserId,
      productId: query.productId,
    });
  }
}
