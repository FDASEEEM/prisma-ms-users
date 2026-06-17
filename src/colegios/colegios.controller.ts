import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { SuperAdminRoleGuard } from "./guards/superadmin-role.guard";
import { ColegiosService } from "./colegios.service";
import { CreateColegioDto } from "./dto/create-colegio.dto";
import { UpdateColegioDto } from "./dto/update-colegio.dto";
import { PaginationDto } from "./dto/pagination.dto";
import { ProfessorsPaginationDto } from "./dto/professors-pagination.dto";

type SuperAdminUser = { id: string; email?: string; nombreCompleto?: string };

@ApiTags("superadmin")
@ApiBearerAuth()
@UseGuards(SuperAdminRoleGuard)
@Controller("superadmin/colegios")
export class ColegiosController {
  constructor(private readonly colegiosService: ColegiosService) {}

  @Get()
  @ApiOperation({ summary: "Listar colegios (paginado)" })
  findAll(@Query() query: PaginationDto) {
    return this.colegiosService.findAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Obtener colegio por ID" })
  findOne(@Param("id") id: string) {
    return this.colegiosService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: "Crear colegio con su primer admin" })
  create(@Body() dto: CreateColegioDto, @Req() request: Request & { superAdminUser?: SuperAdminUser }) {
    return this.colegiosService.create(
      dto,
      request.superAdminUser?.id,
      request.ip ?? request.socket?.remoteAddress,
    );
  }

  @Patch(":id")
  @ApiOperation({ summary: "Actualizar colegio" })
  update(@Param("id") id: string, @Body() dto: UpdateColegioDto, @Req() request: Request & { superAdminUser?: SuperAdminUser }) {
    return this.colegiosService.update(
      id,
      dto,
      request.superAdminUser?.id,
      request.ip ?? request.socket?.remoteAddress,
    );
  }

  @Delete(":id")
  @ApiOperation({ summary: "Desactivar colegio (soft delete)" })
  deactivate(@Param("id") id: string, @Req() request: Request & { superAdminUser?: SuperAdminUser }) {
    return this.colegiosService.deactivate(
      id,
      request.superAdminUser?.id,
      request.ip ?? request.socket?.remoteAddress,
    );
  }

  @Get(":id/stats")
  @ApiOperation({ summary: "Estadísticas del colegio" })
  getStats(@Param("id") id: string) {
    return this.colegiosService.getStats(id);
  }

  @Get(":id/professors")
  @ApiOperation({ summary: "Profesores del colegio (paginado)" })
  getProfessors(@Param("id") id: string, @Query() query: ProfessorsPaginationDto) {
    return this.colegiosService.getProfessors(id, query);
  }
}
