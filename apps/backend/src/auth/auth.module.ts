import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module.js';
import { EventModule } from '../events/event.module.js';
import { UserModule } from '../users/user.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { JwtService } from './jwt.service.js';
import { PasswordService } from './password.service.js';

@Module({
  imports: [AppConfigModule, UserModule, EventModule],
  controllers: [AuthController],
  providers: [AuthService, JwtService, PasswordService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtService, PasswordService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
