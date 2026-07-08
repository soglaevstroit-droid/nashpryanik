import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service.js';
import { EventService } from '../events/event.service.js';
import { EventController } from '../events/event.controller.js';
import { ProcessController } from '../processes/process.controller.js';
import { TaskStepController } from '../task-steps/task-step.controller.js';
import { TaskController } from '../tasks/task.controller.js';
import { UserRecord } from '../users/user-record.js';
import { UserService } from '../users/user.service.js';
import { AuthRequest } from './auth-user.js';
import { AuthService } from './auth.service.js';
import { Roles } from './decorators/roles.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { JwtService } from './jwt.service.js';
import { PasswordService } from './password.service.js';

const createdAt = new Date('2026-07-08T00:00:00.000Z');

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    email: 'worker@example.com',
    passwordHash: 'hash',
    role: 'WORKER',
    name: 'Worker',
    isActive: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function createAuthFixture(seed: UserRecord[] = []) {
  const users = [...seed];
  const eventTypes: string[] = [];
  const passwords = new PasswordService();
  const jwt = new JwtService(new AppConfigService());
  const userService = {
    createUser: async (data) => {
      const user = createUser({
        id: `user-${users.length + 1}`,
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        name: data.name ?? null,
      });

      users.push(user);

      return user;
    },
    findByEmail: async (email: string) =>
      users.find((user) => user.email === email.toLowerCase()) ?? null,
    findById: async (id: string) => users.find((user) => user.id === id) ?? null,
  } as UserService;
  const eventService = {
    createEvent: async (dto) => {
      eventTypes.push(dto.type);

      return {
        id: `event-${eventTypes.length}`,
        type: dto.type,
        actorId: dto.actorId ?? null,
        entityType: dto.entityType ?? null,
        entityId: dto.entityId ?? null,
        payload: dto.payload,
        metadata: dto.metadata ?? null,
        createdAt,
      };
    },
  } as EventService;
  const auth = new AuthService(userService, passwords, jwt, eventService);

  return {
    auth,
    jwt,
    passwords,
    users,
    eventTypes,
  };
}

test('register creates user and USER_CREATED event', async () => {
  const fixture = createAuthFixture();

  const response = await fixture.auth.register({
    email: 'worker@example.com',
    password: 'secret123',
    role: 'WORKER',
    name: 'Worker',
  });

  assert.equal(response.user.email, 'worker@example.com');
  assert.equal(response.user.role, 'WORKER');
  assert.ok(response.accessToken);
  assert.notEqual(fixture.users[0]?.passwordHash, 'secret123');
  assert.deepEqual(fixture.eventTypes, ['USER_CREATED']);
});

test('login returns access token and USER_LOGGED_IN event', async () => {
  const passwords = new PasswordService();
  const fixture = createAuthFixture([
    createUser({
      passwordHash: passwords.hashPassword('secret123'),
    }),
  ]);

  const response = await fixture.auth.login({
    email: 'worker@example.com',
    password: 'secret123',
  });

  assert.equal(response.user.id, 'user-1');
  assert.equal(fixture.jwt.verifyAccessToken(response.accessToken).id, 'user-1');
  assert.deepEqual(fixture.eventTypes, ['USER_LOGGED_IN']);
});

test('me returns current public user', async () => {
  const fixture = createAuthFixture([createUser()]);

  const me = await fixture.auth.getMe({
    id: 'user-1',
    email: 'worker@example.com',
    role: 'WORKER',
  });

  assert.equal(me.email, 'worker@example.com');
  assert.equal(me.role, 'WORKER');
});

test('login rejects wrong password', async () => {
  const passwords = new PasswordService();
  const fixture = createAuthFixture([
    createUser({
      passwordHash: passwords.hashPassword('secret123'),
    }),
  ]);

  await assert.rejects(
    () =>
      fixture.auth.login({
        email: 'worker@example.com',
        password: 'wrong-password',
      }),
    UnauthorizedException,
  );
});

test('jwt guard rejects protected route without token', () => {
  const guard = new JwtAuthGuard(new JwtService(new AppConfigService()));
  const request: AuthRequest = {
    headers: {},
  };

  assert.throws(() => guard.canActivate(createHttpContext(request)), UnauthorizedException);
});

test('roles guard allows matching role and rejects another role', () => {
  class Controller {}
  const handler = () => undefined;
  Roles('FINANCE')(Controller.prototype, 'handler', {
    value: handler,
  } as PropertyDescriptor);

  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const financeRequest: AuthRequest = {
    headers: {},
    user: {
      id: 'user-1',
      email: 'finance@example.com',
      role: 'FINANCE',
    },
  };
  const workerRequest: AuthRequest = {
    headers: {},
    user: {
      id: 'user-2',
      email: 'worker@example.com',
      role: 'WORKER',
    },
  };
  const context = createHttpContext(financeRequest, handler, Controller);

  Reflect.defineMetadata('roles', ['FINANCE'] satisfies Role[], handler);

  assert.equal(guard.canActivate(context), true);
  assert.throws(
    () => guard.canActivate(createHttpContext(workerRequest, handler, Controller)),
    /Forbidden/,
  );
});

test('event controller allows finance read and rejects worker', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = EventController.prototype.listEvents as () => unknown;
  const controller = EventController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('FINANCE'), handler, controller)),
    true,
  );
  assert.throws(
    () => guard.canActivate(createHttpContext(createRequest('WORKER'), handler, controller)),
    /Forbidden/,
  );
});

test('event controller allows foreman write and rejects finance write', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = EventController.prototype.createEvent as () => unknown;
  const controller = EventController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('FOREMAN'), handler, controller)),
    true,
  );
  assert.throws(
    () => guard.canActivate(createHttpContext(createRequest('FINANCE'), handler, controller)),
    /Forbidden/,
  );
});

test('process controller allows foreman and rejects worker', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = ProcessController.prototype.createProcess as () => unknown;
  const controller = ProcessController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('FOREMAN'), handler, controller)),
    true,
  );
  assert.throws(
    () => guard.canActivate(createHttpContext(createRequest('WORKER'), handler, controller)),
    /Forbidden/,
  );
});

test('task controller allows foreman create and rejects partner', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = TaskController.prototype.createTask as () => unknown;
  const controller = TaskController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('FOREMAN'), handler, controller)),
    true,
  );
  assert.throws(
    () => guard.canActivate(createHttpContext(createRequest('PARTNER'), handler, controller)),
    /Forbidden/,
  );
});

test('task controller allows worker lifecycle and rejects finance write', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = TaskController.prototype.acceptTask as () => unknown;
  const controller = TaskController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('WORKER'), handler, controller)),
    true,
  );
  assert.throws(
    () => guard.canActivate(createHttpContext(createRequest('FINANCE'), handler, controller)),
    /Forbidden/,
  );
});

test('task controller allows finance read', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = TaskController.prototype.listTasks as () => unknown;
  const controller = TaskController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('FINANCE'), handler, controller)),
    true,
  );
});

test('task step controller allows foreman create and rejects partner', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = TaskStepController.prototype.createStep as () => unknown;
  const controller = TaskStepController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('FOREMAN'), handler, controller)),
    true,
  );
  assert.throws(
    () => guard.canActivate(createHttpContext(createRequest('PARTNER'), handler, controller)),
    /Forbidden/,
  );
});

test('task step controller allows worker start and rejects finance write', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = TaskStepController.prototype.startStep as () => unknown;
  const controller = TaskStepController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('WORKER'), handler, controller)),
    true,
  );
  assert.throws(
    () => guard.canActivate(createHttpContext(createRequest('FINANCE'), handler, controller)),
    /Forbidden/,
  );
});

test('task step controller allows finance read', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = TaskStepController.prototype.listStepsByTask as () => unknown;
  const controller = TaskStepController;

  assert.equal(
    guard.canActivate(createHttpContext(createRequest('FINANCE'), handler, controller)),
    true,
  );
});

function createHttpContext(
  request: AuthRequest,
  handler: () => unknown = () => undefined,
  controller: object = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

function createRequest(role: Role): AuthRequest {
  return {
    headers: {},
    user: {
      id: `user-${role}`,
      email: `${role.toLowerCase()}@example.com`,
      role,
    },
  };
}
