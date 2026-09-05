import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REGEX } from '@tiles-erp/config';
import type { ProductUom } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const UOMS: ProductUom[] = ['BOX', 'PIECE', 'SQFT'];

export class CreateProductDto {
  @ApiProperty({ example: 'KAJ-VIT-600-IVR' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  sku!: string;

  @ApiProperty({ example: 'Kajaria Vitrified 600x600 Ivory' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  categoryId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  brandId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  seriesId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  collectionId?: string;

  @ApiPropertyOptional({ example: '600x600' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  sizeMm?: string;

  @ApiProperty({ example: 4, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  piecesPerBox!: number;

  @ApiProperty({ example: 15.5, minimum: 0.0001 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  sqftPerBox!: number;

  @ApiPropertyOptional({ enum: UOMS, default: 'BOX' })
  @IsIn(UOMS)
  @IsOptional()
  baseUom?: ProductUom;

  @ApiProperty({ example: '69072100' })
  @Matches(REGEX.HSN, { message: 'hsnCode must be 4-8 digits' })
  hsnCode!: string;

  @ApiProperty({ example: 18, minimum: 0, maximum: 28 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(28)
  gstRate!: number;

  @ApiPropertyOptional({ example: 1250 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  mrp?: number;

  @ApiPropertyOptional({ example: 980 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  sellingRate?: number;

  @ApiPropertyOptional({ example: '8901234567890' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({ example: 20, minimum: 0, description: 'Low-stock alert threshold in boxes' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @IsOptional()
  reorderLevelBoxes?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID('4')
  @IsOptional()
  seriesId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID('4')
  @IsOptional()
  collectionId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(32)
  @IsOptional()
  sizeMm?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  piecesPerBox?: number;

  @ApiPropertyOptional({ minimum: 0.0001 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @IsOptional()
  sqftPerBox?: number;

  @ApiPropertyOptional({ enum: UOMS })
  @IsIn(UOMS)
  @IsOptional()
  baseUom?: ProductUom;

  @ApiPropertyOptional()
  @Matches(REGEX.HSN, { message: 'hsnCode must be 4-8 digits' })
  @IsOptional()
  hsnCode?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 28 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(28)
  @IsOptional()
  gstRate?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  mrp?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  sellingRate?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @IsOptional()
  reorderLevelBoxes?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class ProductListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  seriesId?: string;

  @ApiPropertyOptional({ example: '600x600' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  sizeMm?: string;
}

export class ProductRateEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ example: 850, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchaseRate!: number;

  @ApiProperty({ example: 40, minimum: 0, default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  transportRate!: number;

  @ApiProperty({ example: 10, minimum: 0, default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  additionalRate!: number;

  @ApiPropertyOptional({
    example: 18,
    minimum: 0,
    maximum: 28,
    description: 'Corrects the stored GST rate when supplied',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(28)
  @IsOptional()
  gstRate?: number;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class BulkUpdateProductRatesDto {
  @ApiProperty({ type: [ProductRateEntryDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ProductRateEntryDto)
  items!: ProductRateEntryDto[];
}

export class FixProductAreaDto {
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Left out, every product the audit flagged is corrected',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  productIds?: string[];
}
