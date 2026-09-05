import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import type {
  DriverCashHandoverItem,
  DriverDueSummary,
  Paginated,
} from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { RequireBranchScope } from '../../auth/decorators/scope.decorator';
import { PaginationQueryDto } from '../../../core/http/dto/pagination-query.dto';
import {
  CreateHandoverCommand,
  DeleteHandoverCommand,
  DriverDueQuery,
  GetHandoverQuery,
  ListHandoversQuery,
  OutstandingDriversQuery,
} from '../application/driver-cash.handlers';

export class HandoverAllocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  gatePassId!: string;

  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}

export class CreateHandoverDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  driverId?: string;

  @ApiPropertyOptional({ description: 'For a driver who is not in the master' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  driverName?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  handoverDate?: string;

  @ApiProperty({ description: 'Counted at the counter', example: 2247 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'The drawer the notes went into; posting puts them in its book',
  })
  @IsUUID('4')
  @IsOptional()
  accountId?: string;

  @ApiPropertyOptional({
    type: [HandoverAllocationDto],
    description: 'Left out, the money clears the oldest trips first',
    maxItems: 100,
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HandoverAllocationDto)
  @IsOptional()
  allocations?: HandoverAllocationDto[];
}

export class HandoverListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  driverId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class DriverDueQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  driverId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  driverName?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}

export class OutstandingDriversQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  unused?: number;
}

@ApiTags('Dispatch')
@ApiBearerAuth()
@Controller('driver-cash')
export class DriverCashController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('handovers')
  @RequirePermissions(PERMISSIONS.DRIVER_CASH_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Cash handed in by drivers, newest first' })
  list(@Query() query: HandoverListQueryDto): Promise<Paginated<DriverCashHandoverItem>> {
    return this.queryBus.execute(
      new ListHandoversQuery(query, {
        branchId: query.branchId,
        driverId: query.driverId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      }),
    );
  }

  /** Registered before `handovers/:id` — a literal path has to come first. */
  @Get('outstanding')
  @RequirePermissions(PERMISSIONS.DRIVER_CASH_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: 'Every driver still carrying freight cash' })
  outstanding(@Query() query: OutstandingDriversQueryDto): Promise<DriverDueSummary[]> {
    return this.queryBus.execute(new OutstandingDriversQuery(query.branchId));
  }

  @Get('due')
  @RequirePermissions(PERMISSIONS.DRIVER_CASH_READ)
  @RequireBranchScope({ in: 'query' })
  @ApiOperation({ summary: "One driver's unsettled trips, oldest first" })
  due(@Query() query: DriverDueQueryDto): Promise<DriverDueSummary> {
    return this.queryBus.execute(
      new DriverDueQuery(query.driverId, query.driverName, query.branchId),
    );
  }

  @Get('handovers/:id')
  @RequirePermissions(PERMISSIONS.DRIVER_CASH_READ)
  @ApiOperation({ summary: 'One handover and the trips it cleared' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<DriverCashHandoverItem> {
    return this.queryBus.execute(new GetHandoverQuery(id));
  }

  @Post('handovers')
  @RequirePermissions(PERMISSIONS.DRIVER_CASH_RECEIVE)
  @RequireBranchScope({ in: 'body' })
  @ApiOperation({ summary: 'Take cash off a driver against his open trips' })
  create(
    @Body() body: CreateHandoverDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
  ): Promise<DriverCashHandoverItem> {
    return this.commandBus.execute(new CreateHandoverCommand(body, userId, email));
  }

  @Delete('handovers/:id')
  @RequirePermissions(PERMISSIONS.DRIVER_CASH_RECEIVE)
  @ApiOperation({ summary: 'Reverse a handover; the trips owe the money again' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ success: true }> {
    return this.commandBus.execute(new DeleteHandoverCommand(id, userId));
  }
}
