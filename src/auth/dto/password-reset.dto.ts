import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  email!: string;
}

export class ConfirmPasswordResetDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  otp!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
