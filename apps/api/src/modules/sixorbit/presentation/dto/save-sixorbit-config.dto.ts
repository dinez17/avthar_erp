import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { SaveSixOrbitConfigInput } from '@tiles-erp/shared-types';

export class SaveSixOrbitConfigDto implements SaveSixOrbitConfigInput {
  @ApiProperty({ example: 'http://avthar.sixorbit.com' })
  @IsString()
  @MaxLength(255)
  // Their tenant redirects HTTPS to HTTP, so http:// has to be allowed here — refusing it
  // would make the integration unconfigurable. The trailing path is stripped downstream.
  @Matches(/^https?:\/\/[^\s/?#]+/i, {
    message: 'baseUrl must start with http:// or https:// followed by a host',
  })
  baseUrl!: string;

  @ApiPropertyOptional({ example: '123', description: 'The constant `key` query parameter' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  apiKey?: string;

  @ApiProperty({ example: 'rajesh@avthar.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional({
    description:
      'Write-only. Omit to keep the stored password. It is never returned by any endpoint.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({ minimum: 1000, maximum: 120000, default: 30000 })
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120_000)
  @IsOptional()
  requestTimeoutMs?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string | null;

  @ApiPropertyOptional({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;
}
