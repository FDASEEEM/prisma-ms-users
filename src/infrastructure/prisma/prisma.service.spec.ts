import { PrismaService } from "./prisma.service";

const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock("@prisma/client", () => {
  class MockPrismaClient {
    $connect = mockConnect;
    $disconnect = mockDisconnect;
    $on = jest.fn();
    logUsuario = { create: jest.fn() };
    user = { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() };
  }
  return { PrismaClient: MockPrismaClient };
});

describe("PrismaService", () => {
  let service: PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PrismaService();
  });

  it("extends PrismaClient", () => {
    expect(service).toBeInstanceOf(PrismaClient as any);
  });

  it("onModuleInit calls $connect", async () => {
    await service.onModuleInit();
    expect(mockConnect).toHaveBeenCalled();
  });

  it("onModuleDestroy calls $disconnect", async () => {
    await service.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});

import { PrismaClient } from "@prisma/client";