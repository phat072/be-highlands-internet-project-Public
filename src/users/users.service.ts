import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  private select = { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true, createdAt: true, role: { select: { name: true } } } as const;
  list() { return this.prisma.user.findMany({ select: this.select, orderBy: { name: 'asc' } }); }
  async get(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: this.select });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }
  async create(dto: CreateUserDto, actorId: number) {
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email đã tồn tại');
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Role không tồn tại');
    const user = await this.prisma.user.create({ data: { name: dto.name.trim(), email, phone: dto.phone, passwordHash: await argon2.hash(dto.password), roleId: role.id, mustChangePassword: true }, select: this.select });
    await this.audit.write({ userId: actorId }, 'CREATE_USER', 'USER', String(user.id));
    return user;
  }
  async update(id: number, dto: UpdateUserDto, actorId: number) {
    await this.get(id);
    const role = dto.role ? await this.prisma.role.findUnique({ where: { name: dto.role } }) : null;
    const user = await this.prisma.user.update({ where: { id }, data: { name: dto.name?.trim(), phone: dto.phone, isActive: dto.isActive, roleId: role?.id, passwordHash: dto.password ? await argon2.hash(dto.password) : undefined, mustChangePassword: dto.password ? true : undefined, refreshTokenHash: dto.password || dto.isActive === false ? null : undefined }, select: this.select });
    await this.audit.write({ userId: actorId }, 'UPDATE_USER', 'USER', String(id));
    return user;
  }
  async remove(id: number, actorId: number) {
    if (id === actorId) throw new ConflictException('Không thể vô hiệu hóa chính mình');
    const user = await this.prisma.user.update({ where: { id }, data: { isActive: false, refreshTokenHash: null }, select: this.select });
    await this.audit.write({ userId: actorId }, 'DISABLE_USER', 'USER', String(id));
    return user;
  }
}
