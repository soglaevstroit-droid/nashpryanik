import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UploadPhotoDto } from './dto/upload-photo.dto.js';
import { ArtifactRecord } from './artifact-record.js';
import { ArtifactService } from './artifact.service.js';
import { UploadedArtifactFile } from './uploaded-artifact-file.js';

const uploadPhotoRoles = ['CREATOR', 'DIRECTOR', 'FOREMAN', 'WORKER'] as const;
const readPhotoRoles = ['CREATOR', 'DIRECTOR', 'FOREMAN', 'WORKER', 'FINANCE', 'ANALYST'] as const;

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ArtifactController {
  constructor(private readonly artifacts: ArtifactService) {}

  @Post('artifacts/photos')
  @Roles(...uploadPhotoRoles)
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadPhotoDto,
    @UploadedFile() file: UploadedArtifactFile,
  ): Promise<ArtifactRecord> {
    return this.artifacts.uploadPhoto(user, dto, file);
  }

  @Get('artifacts/:id')
  @Roles(...readPhotoRoles)
  async getPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<StreamableFile> {
    const download = await this.artifacts.getPhoto(user, id);

    return new StreamableFile(download.stream, {
      type: download.artifact.mimeType,
      disposition: `inline; filename="${download.artifact.originalFileName}"`,
    });
  }

  @Get('events/:eventId/artifacts')
  @Roles(...readPhotoRoles)
  listPhotos(
    @CurrentUser() user: AuthUser,
    @Param('eventId') eventId: string,
  ): Promise<ArtifactRecord[]> {
    return this.artifacts.listPhotos(user, eventId);
  }

  @Delete('artifacts/:id')
  @Roles(...uploadPhotoRoles)
  deletePhoto(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ArtifactRecord> {
    return this.artifacts.deletePhoto(user, id);
  }
}
