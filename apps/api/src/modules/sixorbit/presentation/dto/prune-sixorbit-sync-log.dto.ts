import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** The default retention when nobody says otherwise: a quarter of history. */
export const SIXORBIT_DEFAULT_RETENTION_DAYS = 90;

export class PruneSixOrbitSyncLogDto {
  @ApiPropertyOptional({
    minimum: 7,
    maximum: 3650,
    default: SIXORBIT_DEFAULT_RETENTION_DAYS,
    description:
      'Delete attempts older than this many days. The floor of 7 exists so a mistyped 0 cannot erase the evidence of a failure that is still being investigated.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(3650)
  @IsOptional()
  olderThanDays: number = SIXORBIT_DEFAULT_RETENTION_DAYS;
}

export class SixOrbitSyncHealthQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 720,
    default: 24,
    description: 'How far back the attempt counts reach. The "last succeeded" times ignore it.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  @IsOptional()
  windowHours: number = 24;
}
