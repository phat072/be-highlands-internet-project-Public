import { RoleName } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreateUserDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @Transform(emptyToUndefined) @IsOptional() @Matches(/^(0|\+84)\d{9,10}$/) phone?: string;
  @IsEnum(RoleName) role!: RoleName;
}
export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @Transform(emptyToUndefined) @IsOptional() @Matches(/^(0|\+84)\d{9,10}$/) phone?: string;
  @IsOptional() @IsEnum(RoleName) role?: RoleName;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}
