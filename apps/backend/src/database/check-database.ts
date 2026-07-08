import { DatabaseService } from './database.service.js';

const database = new DatabaseService();
const ready = await database.checkConnection();

await database.$disconnect();

if (!ready) {
  console.error('Database connection failed');
  process.exit(1);
}

console.log('Database connection is ready');
