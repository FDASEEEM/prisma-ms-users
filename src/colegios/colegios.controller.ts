import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SuperAdminRoleGuard } from "./guards/superadmin-role.guard";
import { ColegiosService } from "./colegios.service";
import { CreateColegioDto } from "./dto/create-colegio.dto";
import { UpdateColegioDto } from "./dto/update-colegio.dto";
import { PaginationDto } from "./dto/pagination.dto";

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
  create(@Body() dto: CreateColegioDto) {
    return this.colegiosService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Actualizar colegio" })
  update(@Param("id") id: string, @Body() dto: UpdateColegioDto) {
    return this.colegiosService.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Desactivar colegio (soft delete)" })
  deactivate(@Param("id") id: string) {
    return this.colegiosService.deactivate(id);
  }

  @Get(":id/stats")
  @ApiOperation({ summary: "Estadísticas del colegio" })
  getStats(@Param("id") id: string) {
    return this.colegiosService.getStats(id);
  }

  @Get(":id/professors")
  @ApiOperation({ summary: "Profesores del colegio" })
  getProfessors(@Param("id") id: string) {
    return this.colegiosService.getProfessors(id);
  }
}
