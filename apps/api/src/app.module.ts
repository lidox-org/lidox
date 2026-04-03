import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [AuthModule, DocumentsModule, PermissionsModule, AiModule],
})
export class AppModule {}
