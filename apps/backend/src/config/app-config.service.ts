import { Injectable } from '@nestjs/common';
import { AppConfig, loadAppConfig } from './app-config.js';

@Injectable()
export class AppConfigService {
  private readonly config: AppConfig = loadAppConfig();

  get appName(): string {
    return this.config.appName;
  }

  get environment(): AppConfig['environment'] {
    return this.config.environment;
  }

  get port(): number {
    return this.config.port;
  }
}
