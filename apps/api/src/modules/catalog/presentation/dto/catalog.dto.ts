import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

export class CreateCatalogDto {
  @ApiProperty({ example: 'Vitrified' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'VIT' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Owning brand (Series/Collection only)' })
  @IsUUID('4')
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Supplier for the brand (Brands only)' })
  @IsUUID('4')
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCatalogDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Supplier for the brand (Brands only)' })
  @IsUUID('4')
  @IsOptional()
  supplierId?: string;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CatalogListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by owning brand' })
  @IsUUID('4')
  @IsOptional()
  parentId?: string;
}
