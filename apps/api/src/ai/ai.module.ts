import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DocumentsModule } from '../documents/documents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
