import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SuperAdminRoleGuard } from './superadmin-role.guard';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import { UsersService } from '../../users/users.service';

describe('SuperAdminRoleGuard', () => {
  let guard: SuperAdminRoleGuard;
  let supabaseService: jest.Mocked<SupabaseService>;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    supabaseService = {
      getUser: jest.fn(),
    } as any;

    usersService = {
      findBySupabaseUserId: jest.fn(),
    } as any;

    guard = new SuperAdminRoleGuard(supabaseService, usersService);
  });

  const createMockContext = (authHeader?: string): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: authHeader,
          },
        }),
      }),
    } as ExecutionContext;
  };

  it('should throw UnauthorizedException if no authorization header', async () => {
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if invalid authorization header', async () => {
    const context = createMockContext('InvalidToken');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if role is not SUPERADMIN', async () => {
    const context = createMockContext('Bearer valid-token');
    supabaseService.getUser.mockResolvedValue({ id: 'user-id' } as any);
    usersService.findBySupabaseUserId.mockResolvedValue({
      id: 'user-id',
      role: 'ADMIN',
    } as any);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should allow access if role is SUPERADMIN', async () => {
    const context = createMockContext('Bearer valid-token');
    supabaseService.getUser.mockResolvedValue({ id: 'user-id' } as any);
    usersService.findBySupabaseUserId.mockResolvedValue({
      id: 'user-id',
      role: 'SUPERADMIN',
    } as any);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should attach superAdminUser to request', async () => {
    const mockRequest = { headers: { authorization: 'Bearer valid-token' } };
    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as ExecutionContext;

    supabaseService.getUser.mockResolvedValue({ id: 'user-id' } as any);
    usersService.findBySupabaseUserId.mockResolvedValue({
      id: 'user-id',
      role: 'SUPERADMIN',
      email: 'super@test.cl',
    } as any);

    await guard.canActivate(context);

    expect((mockRequest as any).superAdminUser).toBeDefined();
    expect((mockRequest as any).superAdminUser.role).toBe('SUPERADMIN');
  });
});
