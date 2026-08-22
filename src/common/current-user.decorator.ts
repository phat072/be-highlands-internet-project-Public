import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export interface AuthUser { id: number; email: string; role: string; name: string }
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => context.switchToHttp().getRequest<{ user: AuthUser }>().user);
