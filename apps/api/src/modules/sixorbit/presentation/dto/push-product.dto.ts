import { IsUUID } from 'class-validator';

export class PushProductDto {
  @IsUUID()
  branchId!: string;
}
