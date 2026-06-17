import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type TipoEventoUsuario =
  | "register"
  | "login"
  | "logout"
  | "refresh"
  | "profile_update"
  | "colegio_create"
  | "colegio_update"
  | "colegio_deactivate";

export type ResultadoOperacion = "success" | "failure";

export type RegistrarEventoInput = {
  tipoEvento: TipoEventoUsuario;
  userId?: string | null;
  ipOrigen?: string | null;
  resultado: ResultadoOperacion;
  mensaje: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prismaService: PrismaService) {}

  async registrarEvento(input: RegistrarEventoInput): Promise<void> {
    try {
      await (this.prismaService as any).logUsuario.create({
        data: {
          tipoEvento: input.tipoEvento,
          userId: input.userId ?? null,
          ipOrigen: input.ipOrigen ?? null,
          resultado: input.resultado,
          mensaje: input.mensaje,
        },
      });
    } catch {
      // La auditoría no debe romper el flujo principal.
    }
  }
}
