import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { Public } from '../common/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private context(req: Request) { return { ipAddress: req.ip, userAgent: req.headers['user-agent'] }; }
  @Public() @Throttle({ default: { ttl: 60_000, limit: 5 } }) @Post('login') login(@Body() dto: LoginDto, @Req() req: Request) { return this.auth.login(dto, this.context(req)); }
  @Public() @Post('refresh') refresh(@Body('refreshToken') token: string) { return this.auth.refresh(token); }
  @Post('logout') logout(@CurrentUser() user: AuthUser, @Req() req: Request) { return this.auth.logout(user.id, this.context(req)); }
  @Get('me') me(@CurrentUser() user: AuthUser) { return user; }
}
