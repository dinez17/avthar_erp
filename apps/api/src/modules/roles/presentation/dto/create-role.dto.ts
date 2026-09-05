import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'BRANCH_MANAGER' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(255)
  @IsOptional()
  description?: string;

  @ApiProperty({ type: [String], example: ['user:read'] })
  @IsArray()
  @IsString({ each: true })
  permissionCodes!: string[];

  @ApiPropertyOptional({
    default: false,
    description: 'Users with this role appear in salesman pickers',
  })
  @IsBoolean()
  @IsOptional()
  isSalesRole?: boolean;
}
