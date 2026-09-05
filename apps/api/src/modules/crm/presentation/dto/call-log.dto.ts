import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { CallDirection, CallDisposition } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const DIRECTIONS: CallDirection[] = ['OUTBOUND', 'INBOUND'];

const DISPOSITIONS: CallDisposition[] = [
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'SWITCHED_OFF',
  'WRONG_NUMBER',
  'CALLBACK',
  'INTERESTED',
  'NOT_INTERESTED',
];

export class CreateCallLogDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  leadId!: string;

  @ApiPropertyOptional({ enum: DIRECTIONS, default: 'OUTBOUND' })
  @IsIn(DIRECTIONS)
  @IsOptional()
  direction?: CallDirection;

  @ApiProperty({ enum: DISPOSITIONS })
  @IsIn(DISPOSITIONS)
  disposition!: CallDisposition;

  @ApiPropertyOptional({ minimum: 0, maximum: 86_400, description: 'Call length in seconds' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400)
  @IsOptional()
  durationSec?: number;

  @ApiPropertyOptional({ format: 'date-time', description: 'Defaults to now' })
  @IsDateString()
  @IsOptional()
  calledAt?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Required for a CALLBACK disposition' })
  @IsDateString()
  @IsOptional()
  callbackAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

export class CallLogListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  leadId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  callerUserId?: string;

  @ApiPropertyOptional({ enum: DISPOSITIONS })
  @IsIn(DISPOSITIONS)
  @IsOptional()
  disposition?: CallDisposition;

  @ApiPropertyOptional({ description: 'Only calls with a callback now due' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  callbackDue?: boolean;
}
