import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { RegisterDto } from "./auth/dto/register.dto";
import { LoginDto } from "./auth/dto/login.dto";
import { RefreshTokenDto } from "./auth/dto/refresh-token.dto";
import { UpdateMeDto } from "./auth/dto/update-me.dto";
import { CreateUserProfileDto } from "./users/dto/create-user-profile.dto";
import { UpdateUserProfileDto } from "./users/dto/update-user-profile.dto";

describe("DTOs", () => {
  describe("RegisterDto", () => {
    it("passes with valid fields", async () => {
      const dto = plainToInstance(RegisterDto, {
        email: "docente@correo.com",
        password: "Password123!",
        rut: "12.345.678-9",
        nombreCompleto: "Juan Pérez",
        establecimiento: "Liceo San Martín",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });

    it("fails with invalid email", async () => {
      const dto = plainToInstance(RegisterDto, {
        email: "not-an-email",
        password: "Password123!",
        rut: "12.345.678-9",
        nombreCompleto: "Juan Pérez",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("email");
    });

    it("fails with short password", async () => {
      const dto = plainToInstance(RegisterDto, {
        email: "docente@correo.com",
        password: "short",
        rut: "12.345.678-9",
        nombreCompleto: "Juan Pérez",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("password");
    });

    it("passes with optional fields missing", async () => {
      const dto = plainToInstance(RegisterDto, {
        email: "docente@correo.com",
        password: "Password123!",
        rut: "12.345.678-9",
        nombreCompleto: "Juan Pérez",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });
  });

  describe("LoginDto", () => {
    it("passes with valid email and password", async () => {
      const dto = plainToInstance(LoginDto, {
        email: "docente@correo.com",
        password: "Password123!",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });

    it("fails with invalid email", async () => {
      const dto = plainToInstance(LoginDto, {
        email: "invalid",
        password: "Password123!",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("email");
    });

    it("fails with short password", async () => {
      const dto = plainToInstance(LoginDto, {
        email: "docente@correo.com",
        password: "1234567",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("password");
    });
  });

  describe("RefreshTokenDto", () => {
    it("passes with non-empty refreshToken", async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: "some-refresh-token",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });

    it("fails with empty refreshToken", async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: "",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("refreshToken");
    });
  });

  describe("UpdateMeDto", () => {
    it("passes with optional fields", async () => {
      const dto = plainToInstance(UpdateMeDto, {
        nombreCompleto: "Juan Carlos Pérez",
        establecimiento: "Liceo Central",
        phone: "+56998765432",
        specialty: "Lenguaje",
        position: "Jefe de departamento",
        active: false,
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });

    it("passes with empty object", async () => {
      const dto = plainToInstance(UpdateMeDto, {} as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });
  });

  describe("CreateUserProfileDto", () => {
    it("passes with all required fields", async () => {
      const dto = plainToInstance(CreateUserProfileDto, {
        supabaseUserId: "supabase-1",
        email: "docente@correo.com",
        rut: "12.345.678-9",
        nombreCompleto: "Juan Pérez",
        establecimiento: "Liceo San Martín",
        phone: "+56911111111",
        specialty: "Matemáticas",
        position: "Titular",
        active: true,
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });

    it("fails with invalid email", async () => {
      const dto = plainToInstance(CreateUserProfileDto, {
        supabaseUserId: "supabase-1",
        email: "not-email",
        rut: "12.345.678-9",
        nombreCompleto: "Juan Pérez",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("email");
    });

    it("fails with short rut", async () => {
      const dto = plainToInstance(CreateUserProfileDto, {
        supabaseUserId: "supabase-1",
        email: "docente@correo.com",
        rut: "123456",
        nombreCompleto: "Juan Pérez",
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe("rut");
    });
  });

  describe("UpdateUserProfileDto", () => {
    it("passes with optional fields", async () => {
      const dto = plainToInstance(UpdateUserProfileDto, {
        nombreCompleto: "Juan Carlos Pérez",
        establecimiento: "Liceo Central",
        phone: "+56998765432",
        specialty: "Lenguaje",
        position: "Jefe de departamento",
        active: false,
      } as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });

    it("passes with empty object", async () => {
      const dto = plainToInstance(UpdateUserProfileDto, {} as Record<string, unknown>);
      const errors = await validate(dto as any);
      expect(errors).toHaveLength(0);
    });
  });
});