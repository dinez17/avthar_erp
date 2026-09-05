import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@tileserp.local', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe123', minLength: 1 })
  @IsString()
  @MinLength(1)
  password!: string;
}
