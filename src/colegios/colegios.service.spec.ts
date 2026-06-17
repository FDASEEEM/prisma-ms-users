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
      prismaService.colegio.create.mockResolvedValue({ id: 'colegio-id', ...createDto });
      prismaService.user.create.mockResolvedValue({
        id: 'user-id',
        email: createDto.adminEmail,
        nombreCompleto: createDto.adminNombre,
        role: 'ADMIN',
      });

      const result = await service.create(createDto);

      expect(result).toHaveProperty('colegio');
      expect(result).toHaveProperty('admin');
      expect(result.admin.email).toBe(createDto.adminEmail);
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
  });

  describe('findAll', () => {
    it('should return paginated colegios', async () => {
      prismaService.colegio.count.mockResolvedValue(2);
      prismaService.colegio.findMany.mockResolvedValue([
        { id: '1', nombre: 'Colegio 1' },
        { id: '2', nombre: 'Colegio 2' },
      ]);

      const result = await service.findAll({ page: '1', limit: '20' });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('findOne', () => {
    it('should return a colegio by id', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id', nombre: 'Test' });

      const result = await service.findOne('colegio-id');

      expect(result).toEqual({ id: 'colegio-id', nombre: 'Test' });
    });

    it('should throw NotFoundException if not found', async () => {
      prismaService.colegio.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a colegio', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id' });
      prismaService.colegio.update.mockResolvedValue({ id: 'colegio-id', nombre: 'Updated' });

      const result = await service.update('colegio-id', { nombre: 'Updated' });

      expect(result.nombre).toBe('Updated');
    });
  });

  describe('deactivate', () => {
    it('should deactivate a colegio', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id' });
      prismaService.colegio.update.mockResolvedValue({ id: 'colegio-id', activo: false });

      const result = await service.deactivate('colegio-id');

      expect(result.activo).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return stats for a colegio', async () => {
      prismaService.colegio.findUnique.mockResolvedValue({ id: 'colegio-id' });
      prismaService.user.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(0);

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
});
