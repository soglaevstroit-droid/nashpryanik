import test from 'node:test';
import assert from 'node:assert/strict';
import { HealthController } from './health.controller.js';
import { AppConfigService } from '../config/app-config.service.js';

test('health endpoint returns platform status', () => {
  const controller = new HealthController(new AppConfigService(), {
    checkConnection: async () => true,
  } as never);
  const response = controller.getHealth();

  assert.equal(response.status, 'ok');
  assert.equal(response.appName, 'СТРОИТ.РФ');
  assert.equal(response.environment, 'development');
  assert.match(response.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('readiness endpoint returns database status from service', async () => {
  const controller = new HealthController(new AppConfigService(), {
    checkConnection: async () => true,
  } as never);
  const response = await controller.getReadiness();

  assert.equal(response.status, 'ok');
  assert.equal(response.database.connected, true);
});
