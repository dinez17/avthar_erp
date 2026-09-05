import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { CampaignChannel, CampaignStatus } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const CHANNELS: CampaignChannel[] = [
  'PHONE',
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'SOCIAL_MEDIA',
  'EXHIBITION',
  'PRINT',
  'HOARDING',
  'REFERRAL',
  'WEBSITE',
  'OTHER',
];

const STATUSES: CampaignStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

export class CreateCampaignDto {
  @ApiPropertyOptional({ description: 'Left blank, a sequential code is generated' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Diwali Hoardings 2026' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: CHANNELS })
  @IsIn(CHANNELS)
  channel!: CampaignChannel;

  @ApiPropertyOptional({ enum: STATUSES, default: 'DRAFT' })
  @IsIn(STATUSES)
  @IsOptional()
  status?: CampaignStatus;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Total spend on the campaign' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  budget?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  objective?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class UpdateCampaignDto extends CreateCampaignDto {
  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CampaignListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: CampaignStatus;

  @ApiPropertyOptional({ enum: CHANNELS })
  @IsIn(CHANNELS)
  @IsOptional()
  channel?: CampaignChannel;
}
