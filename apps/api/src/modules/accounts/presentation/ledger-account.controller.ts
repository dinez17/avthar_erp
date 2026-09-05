import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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
  ExpenseHeadItem,
  LedgerAccountItem,
  LedgerAccountType,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  LEDGER_ACCOUNT_REPOSITORY,
  type LedgerAccountRepository,
} from '../domain/ledger-account.repository';

const TYPES = ['CASH', 'BANK', 'OWNER'] as const;

export class SaveLedgerAccountDto {
  @ApiPropertyOptional({ description: 'Generated from the branch code when omitted' })
  @IsString()
  @MaxLength(24)
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Axis Bank — 5521' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  type!: LedgerAccountType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for a cash drawer' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ example: 'Axis Bank' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(32)
  @IsOptional()
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'UTIB0001234' })
  @IsString()
  @MaxLength(16)
  @IsOptional()
  ifsc?: string;

  @ApiPropertyOptional({ description: 'Fixed once entries have been posted' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  openingBalance?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  openingDate?: string;

  @ApiPropertyOptional({
    example: 2500,
    description: 'What a drawer keeps back at close to open with tomorrow',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  retainedFloat?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}

export class LedgerAccountQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: TYPES })
  @IsIn(TYPES)
  @IsOptional()
  type?: LedgerAccountType;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  includeInactive?: boolean;
}

export class SaveExpenseHeadDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(24)
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Shop rent' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}

/**
 * Cash boxes and bank accounts.
 *
 * A branch holds as many as it needs — a drawer and one row per bank — and each carries
 * its own opening balance and its own book.
 */
@ApiTags('Accounts')
@ApiBearerAuth()
@Controller('ledger-accounts')
export class LedgerAccountController {
  constructor(
    @Inject(LEDGER_ACCOUNT_REPOSITORY) private readonly accounts: LedgerAccountRepository,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'Accounts with what each holds right now' })
  list(@Query() query: LedgerAccountQueryDto): Promise<LedgerAccountItem[]> {
    return this.accounts.list({
      branchId: query.branchId,
      type: query.type,
      includeInactive: query.includeInactive,
    });
  }

  @Get('expense-heads')
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'Expense heads, with what has been spent this financial year' })
  expenseHeads(@Query('includeInactive') includeInactive?: string): Promise<ExpenseHeadItem[]> {
    return this.accounts.listExpenseHeads(includeInactive === 'true');
  }

  @Post('expense-heads')
  @RequirePermissions(PERMISSIONS.EXPENSE_HEAD_MANAGE)
  @ApiOperation({ summary: 'Add an expense head' })
  createHead(
    @Body() dto: SaveExpenseHeadDto,
    @CurrentUser('id') actorId: string,
  ): Promise<ExpenseHeadItem> {
    return this.accounts.createExpenseHead(dto, actorId);
  }

  @Patch('expense-heads/:id')
  @RequirePermissions(PERMISSIONS.EXPENSE_HEAD_MANAGE)
  @ApiOperation({ summary: 'Rename or retire an expense head' })
  updateHead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveExpenseHeadDto,
    @CurrentUser('id') actorId: string,
  ): Promise<ExpenseHeadItem> {
    return this.accounts.updateExpenseHead(id, dto, actorId);
  }

  @Delete('expense-heads/:id')
  @RequirePermissions(PERMISSIONS.EXPENSE_HEAD_MANAGE)
  @ApiOperation({ summary: 'Delete an unused expense head' })
  async removeHead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: true }> {
    await this.accounts.softDeleteExpenseHead(id, actorId);
    return { success: true };
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.CASH_BOOK_READ)
  @ApiOperation({ summary: 'One account' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<LedgerAccountItem> {
    const account = await this.accounts.findById(id);
    if (!account) throw new Error('Account not found');
    return account;
  }

  @Post()
  @RequirePermissions(PERMISSIONS.LEDGER_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Add a cash drawer or a bank account' })
  create(
    @Body() dto: SaveLedgerAccountDto,
    @CurrentUser('id') actorId: string,
  ): Promise<LedgerAccountItem> {
    return this.accounts.create(dto, actorId);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LEDGER_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Edit an account' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveLedgerAccountDto,
    @CurrentUser('id') actorId: string,
  ): Promise<LedgerAccountItem> {
    return this.accounts.update(id, dto, actorId);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.LEDGER_ACCOUNT_MANAGE)
  @ApiOperation({ summary: 'Delete an account that has never been used' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ): Promise<{ success: true }> {
    await this.accounts.softDelete(id, actorId);
    return { success: true };
  }
}
