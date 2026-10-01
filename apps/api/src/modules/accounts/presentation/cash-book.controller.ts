import { Body, Controller, ForbiddenException, Get, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import type {
  CashBook,
  CashEntryItem,
  CashPosition,
  OwnerStatement,
  OwnerSummary,
  AuthenticatedUser,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CASH_ENTRY_REPOSITORY, type CashEntryRepository } from '../domain/cash-entry.repository';
import { LEDGER_ACCOUNT_REPOSITORY, type LedgerAccountRepository } from '../domain/ledger-account.repository';

/** Transfers have their own endpoint, so they cannot be posted here as a single leg. */
const ENTRY_TYPES = ['RECEIPT', 'PAYMENT', 'EXPENSE'] as const;

const today = (): string => new Date().toISOString();

/** The first of the current month — a sensible default window for a statement. */
const monthStart = (): string => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
};

/** `?includeReversed=true` on a query string arrives as the string, not a boolean. */
const asFlag = (value?: string): boolean => value === 'true';

export class PeriodQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to the 1st of this month' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to today' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'Show reversed entries and their contra rows. Hidden by default.',
  })
  @IsString()
  @IsOptional()
  includeReversed?: string;
}

export class CashBookQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  accountId!: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to the start of today' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to the end of today' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'Show reversed entries and their contra rows. Hidden by default.',
  })
  @IsString()
  @IsOptional()
  includeReversed?: string;
}

export class CashPositionQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  on?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}

export class CashEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  accountId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  entryDate?: string;

  @ApiProperty({ enum: ENTRY_TYPES })
  @IsIn(ENTRY_TYPES)
  type!: (typeof ENTRY_TYPES)[number];

  @ApiProperty({ example: 2500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Customer receiving a payment refund' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for an expense' })
  @IsUUID('4')
  @IsOptional()
  expenseHeadId?: string;

  @ApiPropertyOptional({ description: 'Cheque number, UPI reference, voucher number' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  referenceNo?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  narration?: string;
}

export class CashTransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  fromAccountId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  toAccountId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  entryDate?: string;

  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  @IsOptional()
  referenceNo?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  narration?: string;
}

export class ReverseCashEntryDto {
  @ApiProperty({ example: 'Posted to the wrong account' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

/**
 * The cash book: what has moved, and what each account is left holding.
 *
 * Entries are only added. There is no edit and no delete — a mistake is corrected with a
 * contra row, so the correction is as visible on the page as the mistake was.
 */
@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('cash-book')
export class CashBookController {
  constructor(
    @Inject(CASH_ENTRY_REPOSITORY) private readonly entries: CashEntryRepository,
    @Inject(LEDGER_ACCOUNT_REPOSITORY) private readonly accounts: LedgerAccountRepository,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'One account over a period, with a running balance' })
  async book(@Query() query: CashBookQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<CashBook> {
    await this.assertAccount(query.accountId, user);
    return this.entries.book({
      accountId: query.accountId,
      from: query.from ?? today(),
      to: query.to ?? today(),
      includeReversed: asFlag(query.includeReversed),
    });
  }

  private async assertAccount(accountId: string, user: AuthenticatedUser): Promise<void> {
    if (user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN')) return;
    const account = await this.accounts.findById(accountId);
    if (!account?.branchId || !user.branchIds.includes(account.branchId)) throw new ForbiddenException('You are not assigned to this account branch');
  }

  @Get('position')
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'Every account on one day: opening, movement, closing' })
  position(@Query() query: CashPositionQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<CashPosition> {
    return this.entries.position({ on: query.on ?? today(), branchId: this.branch(query.branchId, user) });
  }

  @Get('owners')
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'Every owner: what they took and what they are still holding' })
  owners(@Query() query: PeriodQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<OwnerSummary> {
    return this.entries.owners(query.from ?? monthStart(), query.to ?? today(), this.branch(query.branchId, user));
  }

  @Get('owners/:accountId')
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: "One owner's statement, with the drawers it came from" })
  ownerStatement(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: PeriodQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OwnerStatement> {
    return this.entries.ownerStatement(
      accountId,
      query.from ?? monthStart(),
      query.to ?? today(),
      asFlag(query.includeReversed),
      this.branch(query.branchId, user),
    );
  }

  private branch(requested: string | undefined, user: AuthenticatedUser): string | undefined {
    const admin = user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN');
    if (requested && !admin && !user.branchIds.includes(requested)) throw new ForbiddenException('You are not assigned to this branch');
    return requested ?? (admin ? undefined : user.branchIds[0]);
  }

  @Post('entries')
  @RequirePermissions(PERMISSIONS.CASH_ENTRY_CREATE)
  @ApiOperation({ summary: 'Post a receipt, a payment or an expense' })
  post(@Body() dto: CashEntryDto, @CurrentUser('id') actorId: string): Promise<CashEntryItem> {
    return this.entries.post(dto, actorId);
  }

  @Post('transfers')
  @RequirePermissions(PERMISSIONS.CASH_ENTRY_CREATE)
  @ApiOperation({ summary: 'Move money between two of your own accounts' })
  transfer(
    @Body() dto: CashTransferDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CashEntryItem[]> {
    return this.entries.transfer(dto, actorId);
  }

  @Post('entries/:id/reverse')
  @RequirePermissions(PERMISSIONS.CASH_ENTRY_REVERSE)
  @ApiOperation({ summary: 'Write the mirror image of an entry' })
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseCashEntryDto,
    @CurrentUser('id') actorId: string,
  ): Promise<CashEntryItem> {
    return this.entries.reverse(id, dto.reason, actorId);
  }
}
