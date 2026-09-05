import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';
import type { StartSixOrbitImportInput } from '@tiles-erp/shared-types';

export class StartSixOrbitImportDto implements StartSixOrbitImportInput {
  @ApiPropertyOptional({
    default: false,
    description: 'Work out what would change and write nothing.',
  })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description:
      'Pull only variations SixOrbit has touched since this moment. Omit for the whole catalogue, which is what the first run has to be.',
  })
  @IsISO8601()
  @IsOptional()
  since?: string;
}
