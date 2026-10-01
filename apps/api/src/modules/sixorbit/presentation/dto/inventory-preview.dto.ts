import { IsDateString, Matches } from 'class-validator';
export class InventoryPreviewDto {
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate!: string;
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate!: string;
}
