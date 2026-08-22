import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuditContext, AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly audit: AuditService) {}
  private async tokens(user: { id: number; email: string; role: { name: string } }, remember = false) {
    const payload = { sub: user.id, email: user.email, role: user.role.name };
    const accessToken = await this.jwt.signAsync(payload, { secret: process.env.JWT_SECRET, expiresIn: '15m' });
    const refreshToken = await this.jwt.signAsync(payload, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: remember ? '30d' : '7d' });
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await argon2.hash(refreshToken), lastLoginAt: new Date() } });
    return { accessToken, refreshToken };
  }
  async login(dto: LoginDto, context: AuditContext) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, include: { role: true } });
    if (!user?.isActive || !(await argon2.verify(user.passwordHash, dto.password))) throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    const tokens = await this.tokens(user, dto.rememberMe);
    await this.audit.write({ ...context, userId: user.id }, 'LOGIN', 'USER', String(user.id));
    return { ...tokens, user: { id: user.id, name: user.name, email: user.email, role: user.role.name, mustChangePassword: user.mustChangePassword } };
  }
  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number }>(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
      if (!user?.refreshTokenHash || !user.isActive || !(await argon2.verify(user.refreshTokenHash, refreshToken))) throw new Error();
      return this.tokens(user);
    } catch { throw new UnauthorizedException('Refresh token không hợp lệ'); }
  }
  async logout(userId: number, context: AuditContext) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
    await this.audit.write({ ...context, userId }, 'LOGOUT', 'USER', String(userId));
    return { loggedOut: true };
  }
}
