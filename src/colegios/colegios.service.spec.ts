import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ColegiosService } from './colegios.service';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { SupabaseService } from '../infrastructure/supabase/supabase.service';
import { AuditService } from '../infrastructure/audit/audit.service';

describe('ColegiosService', () => {
  let service: ColegiosService;
  let prismaService: any;
  let supabaseService: any;
  let auditService: any;

  beforeEach(async () => {
    prismaService = {
      colegio: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };

    supabaseService = {
      createUserWithPasswordAndMetadata: jest.fn(),
      updateUserAppMetadata: jest.fn(),
      deleteUser: jest.fn(),
    };

    auditService = {
      registrarEvento: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ColegiosService,
        { provide: PrismaService, useValue: prismaService },
        { provide: SupabaseService, useValue: supabaseService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ColegiosService>(ColegiosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      nombre: 'Colegio Test',
      direccion: 'Calle Test 123',
      telefono: '+56912345678',
      email: 'test@colegio.cl',
      rut: '76.543.210-K',
      plan: 'basic',
      adminEmail: 'admin@colegio.cl',
      adminPassword: 'Password123!',
      adminNombre: 'Admin Test',
    };

    it('should create a colegio with admin user', async () => {
      prismaService.colegio.findUnique.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      supabaseService.createUserWithPasswordAndMetadata.mockResolvedValue({ id: 'supabase-user-id' });
      prismaService.colegio.create.mockResolvedValue({ id: 'colegio-id', nombre: 'Colegio Test', rut: '76.543.210-K', plan: 'basic' });
      prismaService.user.create.mockResolvedValue({
        id: 'user-id',
        email: createDto.adminEmail,
        nombreCompleto: createDto.adminNombre,
        role: 'ADMIN',
      });

      const result = await service.create(createDto, 'superadmin-id', '127.0.0.1');

      expect(result).toHaveProperty('colegio');
      expect(result).toHaveProperty('admin');
      expect(result.admin.email).toBe(createDto.adminEmail);
      expect(supabaseService.updateUserAppMetadata).toHaveBeenCalledWith(
        'supabase-user-id',
        { role: 'ADMIN', colegioId: 'colegio-id' },
      );
      expect(auditService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'colegio_create',
          userId: 'superadmin-id',
          ipOrigen: '127.0.0.1',
          resultado: 'success',
        }),
      );
    });

    it('should throw ConflictException if email already exists', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if admin email already exists', async () => {
      prismaService.colegio.findUnique.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });

    it('should audit failure when supabase user creation fails', async () => {
      prismaService.colegio.findUnique.mockResolvedValue(null);
      prismaService.user.findUnique.mockResolvedValue(null);
      supabaseService.createUserWithPasswordAndMetadata.mockRejectedValue(new Error('Supabase error'));

      await expect(service.create(createDto, 'superadmin-id', '127.0.0.1')).rejects.toThrow(ConflictException);

      expect(auditService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'colegio_create',
          userId: 'superadmin-id',
          ipOrigen: '127.0.0.1',
          resultado: 'failure',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated colegios with admin counts', async () => {
      prismaService.colegio.count.mockResolvedValue(2);
      prismaService.colegio.findMany.mockResolvedValue([
        { id: '1', nombre: 'Colegio 1', _count: { users: 5 } },
        { id: '2', nombre: 'Colegio 2', _count: { users: 3 } },
      ]);
      // 4 calls expected: 2 colegios * 2 counts (admins, activeAdmins)
      prismaService.user.count
        .mockResolvedValueOnce(2)  // colegio 1: admins
        .mockResolvedValueOnce(1)  // colegio 1: activeAdmins
        .mockResolvedValueOnce(1)  // colegio 2: admins
        .mockResolvedValueOnce(1); // colegio 2: activeAdmins

      const result = await service.findAll({ page: '1', limit: '20' });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0]._count).toEqual({ users: 5, admins: 2, activeAdmins: 1 });
      expect(result.data[1]._count).toEqual({ users: 3, admins: 1, activeAdmins: 1 });
    });
  });

  describe('findOne', () => {
    it('should return a colegio by id with admin counts', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({
        id: 'colegio-id',
        nombre: 'Test',
        _count: { users: 5 },
      });
      prismaService.user.count
        .mockResolvedValueOnce(2) // admins count
        .mockResolvedValueOnce(1); // activeAdmins count

      const result = await service.findOne('colegio-id');

      expect(result).toEqual({
        id: 'colegio-id',
        nombre: 'Test',
        _count: { users: 5, admins: 2, activeAdmins: 1 },
      });
    });

    it('should throw NotFoundException if not found', async () => {
      prismaService.colegio.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a colegio and audit the change', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id', nombre: 'Old Name', plan: 'basic', activo: true });
      prismaService.colegio.update.mockResolvedValue({ id: 'colegio-id', nombre: 'Updated', plan: 'premium', activo: true });

      const result = await service.update('colegio-id', { nombre: 'Updated', plan: 'premium' }, 'superadmin-id', '127.0.0.1');

      expect(result.nombre).toBe('Updated');
      expect(auditService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'colegio_update',
          userId: 'superadmin-id',
          ipOrigen: '127.0.0.1',
          resultado: 'success',
        }),
      );
    });
  });

  describe('deactivate', () => {
    it('should deactivate a colegio and audit the action', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id', nombre: 'Test Colegio', rut: '12.345.678-9', activo: true });
      prismaService.colegio.update.mockResolvedValue({ id: 'colegio-id', activo: false });

      const result = await service.deactivate('colegio-id', 'superadmin-id', '127.0.0.1');

      expect(result.activo).toBe(false);
      expect(auditService.registrarEvento).toHaveBeenCalledWith(
        expect.objectContaining({
          tipoEvento: 'colegio_deactivate',
          userId: 'superadmin-id',
          ipOrigen: '127.0.0.1',
          resultado: 'success',
        }),
      );
    });
  });

  describe('getStats', () => {
    it('should return stats for a colegio', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id' });
      // findOne now makes 2 calls (admins, activeAdmins) before getStats makes 5
      prismaService.user.count
        .mockResolvedValueOnce(2) // findOne: admins count
        .mockResolvedValueOnce(1) // findOne: activeAdmins count
        .mockResolvedValueOnce(10) // getStats: totalUsers
        .mockResolvedValueOnce(8) // getStats: activeUsers
        .mockResolvedValueOnce(2) // getStats: admins
        .mockResolvedValueOnce(6) // getStats: teachers
        .mockResolvedValueOnce(0); // getStats: superadmins

      const result = await service.getStats('colegio-id');

      expect(result).toEqual({
        totalUsers: 10,
        activeUsers: 8,
        admins: 2,
        teachers: 6,
        superadmins: 0,
      });
    });
  });

  describe('getProfessors', () => {
    it('should return paginated professors for a colegio', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id' });
      prismaService.user.count.mockResolvedValue(2);
      prismaService.user.findMany.mockResolvedValue([
        { id: '1', nombreCompleto: 'Prof 1', role: 'TEACHER' },
        { id: '2', nombreCompleto: 'Prof 2', role: 'TEACHER' },
      ]);

      const result = await service.getProfessors('colegio-id', { page: '1', limit: '20' });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should filter professors by active status', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id' });
      prismaService.user.count.mockResolvedValue(1);
      prismaService.user.findMany.mockResolvedValue([
        { id: '1', nombreCompleto: 'Prof 1', role: 'TEACHER', active: true },
      ]);

      await service.getProfessors('colegio-id', { active: 'true' });

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('should filter professors by specialty', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id' });
      prismaService.user.count.mockResolvedValue(1);
      prismaService.user.findMany.mockResolvedValue([
        { id: '1', nombreCompleto: 'Prof 1', role: 'TEACHER', specialty: 'Matemáticas' },
      ]);

      await service.getProfessors('colegio-id', { specialty: 'Mate' });

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            specialty: { contains: 'Mate', mode: 'insensitive' },
          }),
        }),
      );
    });
  });
});
