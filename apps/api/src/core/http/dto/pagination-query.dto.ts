import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PAGINATION } from '@tiles-erp/config';
import type { PaginationQuery, SortOrder } from '@tiles-erp/shared-types';

/** Reusable query DTO for every paginated list endpoint. */
export class PaginationQueryDto implements PaginationQuery {
  @ApiPropertyOptional({ minimum: 1, default: PAGINATION.DEFAULT_PAGE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = PAGINATION.DEFAULT_PAGE;

  @ApiPropertyOptional({ minimum: 1, maximum: PAGINATION.MAX_PAGE_SIZE, default: PAGINATION.DEFAULT_PAGE_SIZE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_PAGE_SIZE)
  @IsOptional()
  pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsIn(['asc', 'desc'])
  @IsOptional()
  sortOrder: SortOrder = 'asc';

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;
}
