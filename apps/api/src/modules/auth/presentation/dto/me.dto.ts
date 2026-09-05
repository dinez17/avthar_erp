import { ApiProperty } from '@nestjs/swagger';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';

export class MeDto implements AuthenticatedUser {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  roleIds!: string[];

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  branchIds!: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  departmentIds!: string[];
}
