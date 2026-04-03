import {
  Controller,
  Get,
  Post,
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
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShareDocumentSchema, UUIDSchema } from '@lidox/types';

interface AuthenticatedUser {
  userId: string;
  email: string;
  jti: string;
}

@Controller('documents/:docId')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /* ---------------------------------------------------------------- */
  /*  POST /api/documents/:docId/share                                 */
  /* ---------------------------------------------------------------- */
  @Post('share')
  async share(
    @Param('docId') docId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const idParsed = UUIDSchema.safeParse(docId);
    if (!idParsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const bodyParsed = ShareDocumentSchema.safeParse(body);
    if (!bodyParsed.success) {
      throw new BadRequestException(bodyParsed.error.flatten());
    }

    const user = req.user as AuthenticatedUser;
    return this.permissionsService.share(idParsed.data, bodyParsed.data, user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  GET /api/documents/:docId/permissions                            */
  /* ---------------------------------------------------------------- */
  @Get('permissions')
  async list(@Param('docId') docId: string, @Req() req: Request) {
    const idParsed = UUIDSchema.safeParse(docId);
    if (!idParsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const user = req.user as AuthenticatedUser;
    return this.permissionsService.listForDocument(idParsed.data, user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  DELETE /api/documents/:docId/permissions/:pid                     */
  /* ---------------------------------------------------------------- */
  @Delete('permissions/:pid')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param('docId') docId: string,
    @Param('pid') pid: string,
    @Req() req: Request,
  ) {
    const docIdParsed = UUIDSchema.safeParse(docId);
    if (!docIdParsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const pidParsed = UUIDSchema.safeParse(pid);
    if (!pidParsed.success) {
      throw new BadRequestException('Invalid permission ID');
    }

    const user = req.user as AuthenticatedUser;
    return this.permissionsService.revoke(docIdParsed.data, pidParsed.data, user.userId);
  }
}
