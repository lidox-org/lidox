import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { DocumentsModule } from '../documents/documents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, DocumentsModule],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
