import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
@Roles(RoleName.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get() list() { return this.users.list(); }
  @Post() create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser) { return this.users.create(dto, user.id); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.users.get(id); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser) { return this.users.update(id, dto, user.id); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.users.remove(id, user.id); }
}
