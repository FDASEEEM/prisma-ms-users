import { Test, TestingModule } from '@nestjs/testing';
import { ColegiosController } from './colegios.controller';
import { ColegiosService } from './colegios.service';
import { SuperAdminRoleGuard } from './guards/superadmin-role.guard';

describe('ColegiosController', () => {
  let controller: ColegiosController;
  let service: jest.Mocked<ColegiosService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ColegiosController],
      providers: [
        {
          provide: ColegiosService,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            deactivate: jest.fn(),
            getStats: jest.fn(),
            getProfessors: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(SuperAdminRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ColegiosController>(ColegiosController);
    service = module.get(ColegiosService) as jest.Mocked<ColegiosService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call service.create with dto', async () => {
      const dto = {
        nombre: 'Test',
        direccion: 'Calle 123',
        email: 'test@test.cl',
        rut: '12.345.678-9',
        adminEmail: 'admin@test.cl',
        adminPassword: 'Password123!',
        adminNombre: 'Admin',
      };
      service.create.mockResolvedValue({ colegio: { id: '1' }, admin: { id: '2' } } as any);

      const result = await controller.create(dto as any);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toHaveProperty('colegio');
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with query', async () => {
      const query = { page: '1', limit: '20' };
      service.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 } as any);

      const result = await controller.findAll(query);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toHaveProperty('data');
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id', async () => {
      service.findOne.mockResolvedValue({ id: 'colegio-id' } as any);

      const result = await controller.findOne('colegio-id');

      expect(service.findOne).toHaveBeenCalledWith('colegio-id');
      expect(result.id).toBe('colegio-id');
    });
  });

  describe('update', () => {
    it('should call service.update with id and dto', async () => {
      const dto = { nombre: 'Updated' };
      service.update.mockResolvedValue({ id: 'colegio-id', nombre: 'Updated' } as any);

      const result = await controller.update('colegio-id', dto);

      expect(service.update).toHaveBeenCalledWith('colegio-id', dto);
      expect(result.nombre).toBe('Updated');
    });
  });

  describe('deactivate', () => {
    it('should call service.deactivate with id', async () => {
      service.deactivate.mockResolvedValue({ id: 'colegio-id', activo: false } as any);

      const result = await controller.deactivate('colegio-id');

      expect(service.deactivate).toHaveBeenCalledWith('colegio-id');
      expect(result.activo).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should call service.getStats with id', async () => {
      service.getStats.mockResolvedValue({ totalUsers: 10 } as any);

      const result = await controller.getStats('colegio-id');

      expect(service.getStats).toHaveBeenCalledWith('colegio-id');
      expect(result.totalUsers).toBe(10);
    });
  });

  describe('getProfessors', () => {
    it('should call service.getProfessors with id', async () => {
      service.getProfessors.mockResolvedValue([{ id: '1' }] as any);

      const result = await controller.getProfessors('colegio-id');

      expect(service.getProfessors).toHaveBeenCalledWith('colegio-id');
      expect(result).toHaveLength(1);
    });
  });
});
