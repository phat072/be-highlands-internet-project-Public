import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ReminderStatus, RoleName } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';
import { RemindersService } from './reminders.service';
@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}
  @Get() list(@CurrentUser() user: AuthUser, @Query('status') status?: ReminderStatus) { return this.reminders.list(user, status); }
  @Post() @Roles(RoleName.ADMIN, RoleName.PROJECT_MANAGER, RoleName.STAFF) create(@Body() dto: CreateReminderDto, @CurrentUser() user: AuthUser) { return this.reminders.create(dto, user); }
  @Patch(':id') @Roles(RoleName.ADMIN, RoleName.PROJECT_MANAGER, RoleName.STAFF) update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReminderDto, @CurrentUser() user: AuthUser) { return this.reminders.update(id, dto, user); }
}
