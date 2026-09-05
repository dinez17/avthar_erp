import { ApiProperty } from '@nestjs/swagger';
import type { AuthTokens } from '@tiles-erp/shared-types';

export class AuthTokensDto implements AuthTokens {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ enum: ['Bearer'], default: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn!: number;
}
