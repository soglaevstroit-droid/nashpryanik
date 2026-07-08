import { AppConfigService } from '../config/app-config.service.js';
import { DatabaseService } from './database.service.js';

const database = new DatabaseService(new AppConfigService());
const ready = await database.checkConnection();

await database.$disconnect();

if (!ready) {
  console.error('Database connection failed');
  process.exit(1);
}

console.log('Database connection is ready');
