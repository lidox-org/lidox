import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiInvokeSchema, UUIDSchema } from '@lidox/types';

interface AuthenticatedUser {
  userId: string;
  email: string;
  jti: string;
}

@Controller('documents/:docId/ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /* ---------------------------------------------------------------- */
  /*  POST /api/documents/:docId/ai/invoke                             */
  /* ---------------------------------------------------------------- */
  @Post('invoke')
  async invoke(
    @Param('docId') docId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const idParsed = UUIDSchema.safeParse(docId);
    if (!idParsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const bodyParsed = AiInvokeSchema.safeParse(body);
    if (!bodyParsed.success) {
      throw new BadRequestException(bodyParsed.error.flatten());
    }

    const user = req.user as AuthenticatedUser;
    return this.aiService.invoke(idParsed.data, bodyParsed.data, user.userId);
  }

  /* ---------------------------------------------------------------- */
  /*  GET /api/documents/:docId/ai/tasks/:taskId                       */
  /* ---------------------------------------------------------------- */
  @Get('tasks/:taskId')
  async getTask(
    @Param('docId') docId: string,
    @Param('taskId') taskId: string,
    @Req() req: Request,
  ) {
    const docIdParsed = UUIDSchema.safeParse(docId);
    if (!docIdParsed.success) {
      throw new BadRequestException('Invalid document ID');
    }

    const taskIdParsed = UUIDSchema.safeParse(taskId);
    if (!taskIdParsed.success) {
      throw new BadRequestException('Invalid task ID');
    }

    const user = req.user as AuthenticatedUser;
    return this.aiService.getTaskStatus(
      docIdParsed.data,
      taskIdParsed.data,
      user.userId,
    );
  }
}
