import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

export class BranchPriceListQueryDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Branch whose prices are listed' })
  @IsUUID('4')
  branchId!: string;

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

export class BranchPriceEntryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ example: 1400, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  displayPrice!: number;

  @ApiProperty({ example: 1150, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minSellingPrice!: number;

  @ApiProperty({ example: 1250, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice!: number;

  @ApiProperty({ description: '0 for a new price row, otherwise the version last read' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

export class BulkUpdateBranchPricesDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ type: [BranchPriceEntryDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BranchPriceEntryDto)
  items!: BranchPriceEntryDto[];
}
