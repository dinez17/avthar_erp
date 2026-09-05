import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PAGINATION } from '@tiles-erp/config';
import type { SixOrbitEntityType, SixOrbitSyncLogQuery } from '@tiles-erp/shared-types';

const ENTITY_TYPES: SixOrbitEntityType[] = [
  'CONNECTION',
  'MASTER',
  'CUSTOMER',
  'PRODUCT',
  'SALES_ORDER',
];

export class SixOrbitSyncLogQueryDto implements SixOrbitSyncLogQuery {
  @ApiPropertyOptional({ enum: ENTITY_TYPES })
  @IsIn(ENTITY_TYPES)
  @IsOptional()
  entityType?: SixOrbitEntityType;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Filter to successes or failures only' })
  // A query string carries "false" as a non-empty string, which is truthy. Without this
  // the failures-only filter would silently show successes too.
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true' || value === true))
  @IsBoolean()
  @IsOptional()
  success?: boolean;

  @ApiPropertyOptional({ example: 'customer/add_customer' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  task?: string;

  @ApiPropertyOptional({ description: 'Free text across the task, the message and their id' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional()
  @IsISO8601()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ minimum: 1, default: PAGINATION.DEFAULT_PAGE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = PAGINATION.DEFAULT_PAGE;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: PAGINATION.MAX_PAGE_SIZE,
    default: PAGINATION.DEFAULT_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_PAGE_SIZE)
  @IsOptional()
  pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE;
}
