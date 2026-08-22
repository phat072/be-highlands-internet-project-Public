import { ReminderPriority, ReminderStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
export class CreateReminderDto {
  @IsOptional() @IsInt() siteId?: number;
  @IsString() @MinLength(2) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() dueAt!: string;
  @IsOptional() @IsEnum(ReminderPriority) priority?: ReminderPriority;
  @IsInt() assigneeId!: number;
}
export class UpdateReminderDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsEnum(ReminderPriority) priority?: ReminderPriority;
  @IsOptional() @IsEnum(ReminderStatus) status?: ReminderStatus;
  @IsOptional() @IsInt() assigneeId?: number;
}
