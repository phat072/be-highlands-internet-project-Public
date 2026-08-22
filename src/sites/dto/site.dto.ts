import { HighlandsStatus, InfrastructureStatus, IssueStatus, ProjectType } from '@prisma/client';
import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

const phoneRegex = /^(0|\+84)\d{9,10}$/;
const taxRegex = /^\d{10}(-\d{3})?$/;

export class CreateSiteDto {
  @IsOptional() @IsEnum(ProjectType) projectType?: ProjectType;
  @IsOptional() @IsEnum(HighlandsStatus) highlandsStatus?: HighlandsStatus;
  @IsString() @MinLength(2) province!: string;
  @IsOptional() @Matches(taxRegex) taxCode?: string;
  @IsOptional() @IsInt() storeTypeId?: number;
  @IsString() @MinLength(2) storeName!: string;
  @IsString() @MinLength(5) address!: string;
  @IsOptional() @IsDateString() sitePossessionDate?: string;
  @IsOptional() @IsString() highlandsPicName?: string;
  @IsOptional() @Matches(phoneRegex) highlandsPicPhone?: string;
  @IsOptional() @IsDateString() viettelSignalHandoverDate?: string;
  @IsOptional() @IsString() ftelContractNumber?: string;
  @IsOptional() @IsString() pppoeUsername?: string;
  @IsOptional() @IsString() pppoePassword?: string;
  @IsOptional() @IsDateString() onlineDateTime?: string;
  @IsOptional() @IsDateString() configurationCompletedAt?: string;
  @IsOptional() @IsEnum(InfrastructureStatus) outdoorStatus?: InfrastructureStatus;
  @IsOptional() @IsEnum(InfrastructureStatus) indoorStatus?: InfrastructureStatus;
  @IsOptional() @IsDateString() infrastructureCompletedDate?: string;
  @IsOptional() @Matches(phoneRegex) surveyContactPhone?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsEnum(IssueStatus) issueStatus?: IssueStatus;
  @IsOptional() @IsString() issueContent?: string;
  @IsOptional() @IsDateString() targetOnlineAt?: string;
  @IsOptional() @IsBoolean() duplicateOverride?: boolean;
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}

export class QuerySitesDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(HighlandsStatus) status?: HighlandsStatus;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @Type(() => Number) @IsInt() storeTypeId?: number;
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean() online?: boolean;
  @IsOptional() @IsDateString() possessionFrom?: string;
  @IsOptional() @IsDateString() possessionTo?: string;
  @IsOptional() @IsString() sortBy = 'updatedAt';
  @IsOptional() @IsString() sortOrder: 'asc' | 'desc' = 'desc';
}

export class QuickUpdateDto {
  @IsOptional() @IsEnum(HighlandsStatus) highlandsStatus?: HighlandsStatus;
  @IsOptional() @IsEnum(InfrastructureStatus) outdoorStatus?: InfrastructureStatus;
  @IsOptional() @IsEnum(InfrastructureStatus) indoorStatus?: InfrastructureStatus;
  @IsOptional() @IsDateString() onlineDateTime?: string;
}

export class AddNoteDto { @IsString() @MinLength(2) content!: string; }
