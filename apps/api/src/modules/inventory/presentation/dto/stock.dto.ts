import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { MovementType } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const MOVEMENT_TYPES: MovementType[] = [
  'OPENING',
  'PURCHASE',
  'PURCHASE_RETURN',
  'SALE',
  'SALE_RETURN',
  'ADJUSTMENT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
];

export class StockBalanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  godownId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  shade?: string;

  @ApiPropertyOptional({ default: true, description: 'Hide rows that have netted to zero' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  nonZeroOnly?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Merge batch/shade rows into one line per product and godown',
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  groupByProduct?: boolean;
}

export class StockMovementQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  godownId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ enum: MOVEMENT_TYPES })
  @IsIn(MOVEMENT_TYPES)
  @IsOptional()
  type?: MovementType;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  toDate?: string;
}

export class StockEntryLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  godownId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  gateId?: string;

  @ApiPropertyOptional({ example: 'B-2401' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional({ example: 'Light' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  shade?: string;

  @ApiProperty({ example: 25, description: 'Boxes; negative reduces stock (adjustments only)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  qtyBoxes!: number;
}

export class PostOpeningStockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  movementDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiProperty({ type: [StockEntryLineDto], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StockEntryLineDto)
  lines!: StockEntryLineDto[];
}

export class PostAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ example: 'Physical count correction' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  movementDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiProperty({ type: [StockEntryLineDto], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StockEntryLineDto)
  lines!: StockEntryLineDto[];
}

export class StockCountLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiPropertyOptional({ example: 'B-2401' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional({ example: 'Light' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  shade?: string;

  @ApiProperty({ example: 40, description: 'Counted full boxes' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  boxes!: number;

  @ApiProperty({ example: 2, description: 'Counted loose pieces' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  pieces!: number;
}

export class BulkSetStockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  godownId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  gateId?: string;

  @ApiProperty({ example: 'Physical stock count' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  movementDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiProperty({ type: [StockCountLineDto], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StockCountLineDto)
  lines!: StockCountLineDto[];
}
