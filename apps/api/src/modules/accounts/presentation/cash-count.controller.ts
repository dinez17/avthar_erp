import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import type {
  CashCountItem,
  DayCloseStatus,
  DenominationCounts,
  VarianceReport,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CASH_COUNT_REPOSITORY, type CashCountRepository } from '../domain/cash-count.repository';

/** The first of the current month — a sensible default window for a trend. */
const monthStart = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
};

export class CashCountQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  accountId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class CloseDayDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  accountId!: string;

  @ApiProperty({ format: 'date-time', description: 'The day being closed' })
  @IsDateString()
  closeDate!: string;

  @ApiProperty({ example: 14750, description: 'Ignored when a denomination breakdown is given' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedAmount!: number;

  @ApiPropertyOptional({
    example: { '500': 20, '200': 15, '100': 17, '50': 1 },
    description: 'How many of each note and coin. Given, it decides the total.',
  })
  @IsObject()
  @IsOptional()
  denominations?: DenominationCounts;

  @ApiPropertyOptional({
    description: 'Write an adjusting entry so the book matches what was counted',
  })
  @IsBoolean()
  @IsOptional()
  postDifference?: boolean;

  @ApiPropertyOptional({ example: 100000, description: "The day's takings going to an owner" })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  handoverAmount?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Which owner is taking the cash' })
  @IsUUID('4')
  @IsOptional()
  handoverAccountId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}

export class ReopenDayDto {
  @ApiProperty({ example: 'Miscounted the 500s' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/**
 * Counting an account against its book, and locking the day once it agrees.
 *
 * A cash book nobody counts is a guess. Closing freezes what the book said, records what
 * was actually there, and refuses anything dated behind the count.
 */
@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('cash-counts')
export class CashCountController {
  constructor(@Inject(CASH_COUNT_REPOSITORY) private readonly counts: CashCountRepository) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'Past closes, newest first' })
  list(@Query() query: CashCountQueryDto): Promise<CashCountItem[]> {
    return this.counts.list(query);
  }

  @Get('variances')
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'How the counts have gone, one line per account' })
  variances(@Query() query: CashCountQueryDto): Promise<VarianceReport> {
    return this.counts.variances(
      query.from ?? monthStart(),
      query.to ?? new Date().toISOString(),
      query.branchId,
    );
  }

  @Get('status/:accountId')
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'The next day open for counting, and what the book expects' })
  status(@Param('accountId', ParseUUIDPipe) accountId: string): Promise<DayCloseStatus> {
    return this.counts.status(accountId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CASH_COUNT_CLOSE)
  @ApiOperation({ summary: 'Close a day against a count' })
  close(@Body() dto: CloseDayDto, @CurrentUser('id') actorId: string): Promise<CashCountItem> {
    return this.counts.close(dto, actorId);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.CASH_COUNT_REOPEN)
  @ApiOperation({ summary: 'Unlock a closed day and undo its adjustment' })
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenDayDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CashCountItem> {
    return this.counts.reopen(id, dto.reason, actorId);
  }
}
