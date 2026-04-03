import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateDocumentSchema, UpdateDocumentSchema, UUIDSchema } from '@lidox/types';

interface AuthenticatedUser {
  userId: string;
  email: string;
  jti: string;
}

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  /* ---------------------------------------------------------------- */
  /*  POST /api/documents                                              */
  /* ---------------------------------------------------------------- */
  @Post()
  async create(@Body() body: unknown, @Req() req: Request) {
    const parsed = CreateDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const user = req.user as AuthenticatedUser;
    return this.documentsService.create(parsed.data, user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  GET /api/documents                                               */
  /* ---------------------------------------------------------------- */
  @Get()
  async list(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.documentsService.listForUser(user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  GET /api/documents/:id                                           */
  /* ---------------------------------------------------------------- */
  @Get(':id')
  async getById(@Param('id') id: string, @Req() req: Request) {
    const parsed = UUIDSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const user = req.user as AuthenticatedUser;
    return this.documentsService.getById(parsed.data, user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  PATCH /api/documents/:id                                         */
  /* ---------------------------------------------------------------- */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const idParsed = UUIDSchema.safeParse(id);
    if (!idParsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const bodyParsed = UpdateDocumentSchema.safeParse(body);
    if (!bodyParsed.success) {
      throw new BadRequestException(bodyParsed.error.flatten());
    }

    const user = req.user as AuthenticatedUser;
    return this.documentsService.update(idParsed.data, bodyParsed.data, user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  DELETE /api/documents/:id                                        */
  /* ---------------------------------------------------------------- */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Req() req: Request) {
    const parsed = UUIDSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const user = req.user as AuthenticatedUser;
    await this.documentsService.softDelete(parsed.data, user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  GET /api/documents/:id/versions                                  */
  /* ---------------------------------------------------------------- */
  @Get(':id/versions')
  async listVersions(@Param('id') id: string, @Req() req: Request) {
    const parsed = UUIDSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const user = req.user as AuthenticatedUser;
    return this.documentsService.listVersions(parsed.data, user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  POST /api/documents/:id/versions/:versionId/restore              */
  /* ---------------------------------------------------------------- */
  @Post(':id/versions/:versionId/restore')
  async restoreVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Req() req: Request,
  ) {
    const idParsed = UUIDSchema.safeParse(id);
    if (!idParsed.success) {
      throw new BadRequestException('Invalid document ID');
    }
    const versionIdParsed = UUIDSchema.safeParse(versionId);
    if (!versionIdParsed.success) {
      throw new BadRequestException('Invalid version ID');
    }

    const user = req.user as AuthenticatedUser;
    return this.documentsService.restoreVersion(idParsed.data, versionIdParsed.data, user.userId);
  }
}
