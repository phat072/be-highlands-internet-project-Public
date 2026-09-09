import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { AuditContext, AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ConfirmPasswordResetDto, RequestPasswordResetDto } from './dto/password-reset.dto';
import { MailService } from './mail.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly audit: AuditService, private readonly mail: MailService) {}
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

  async requestPasswordReset(dto: RequestPasswordResetDto, context: AuditContext) {
    const message = 'Nếu email tồn tại và đang hoạt động, mã OTP sẽ được gửi đến hộp thư';
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, isActive: true } });
    if (!user?.isActive) return { message };

    const latest = await this.prisma.passwordResetOtp.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
    if (latest && Date.now() - latest.createdAt.getTime() < 60_000) return { message };

    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const record = await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetOtp.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      return transaction.passwordResetOtp.create({ data: { userId: user.id, codeHash: this.hashOtp(user.id, otp), expiresAt } });
    });

    try {
      await this.mail.sendPasswordResetOtp(user.email, user.name, otp);
    } catch (error) {
      await this.prisma.passwordResetOtp.delete({ where: { id: record.id } }).catch(() => undefined);
      throw error;
    }
    await this.audit.write({ ...context, userId: user.id }, 'REQUEST_PASSWORD_RESET', 'USER', String(user.id));
    return { message };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto, context: AuditContext) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, isActive: true } });
    if (!user?.isActive) throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');

    const record = await this.prisma.passwordResetOtp.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= 5) throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');

    const expected = Buffer.from(record.codeHash, 'hex');
    const actual = Buffer.from(this.hashOtp(user.id, dto.otp), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const attempts = record.attempts + 1;
      await this.prisma.passwordResetOtp.update({ where: { id: record.id }, data: { attempts, usedAt: attempts >= 5 ? new Date() : undefined } });
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(dto.newPassword), refreshTokenHash: null, mustChangePassword: false } }),
      this.prisma.passwordResetOtp.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    ]);
    await this.audit.write({ ...context, userId: user.id }, 'RESET_PASSWORD_WITH_OTP', 'USER', String(user.id));
    return { passwordChanged: true };
  }

  private hashOtp(userId: number, otp: string) {
    const secret = process.env.PASSWORD_RESET_OTP_SECRET;
    if (!secret) throw new Error('PASSWORD_RESET_OTP_SECRET is not configured');
    return createHmac('sha256', secret).update(`${userId}:${otp}`).digest('hex');
  }
}
