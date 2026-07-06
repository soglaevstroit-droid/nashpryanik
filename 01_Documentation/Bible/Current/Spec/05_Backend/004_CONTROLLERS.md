# 004 — Controllers

## Назначение
Контроллеры связывают REST API `/api/v1` с сервисами. Контроллер не содержит SQL и не реализует бизнес-логику, а только обрабатывает HTTP-уровень.

## AuthController
Endpoint-ы:
- `POST /api/v1/auth/login`;
- `POST /api/v1/auth/refresh`;
- `GET /api/v1/auth/me`;
- `POST /api/v1/auth/logout`.

Сервис: `AuthService`, `UserService`.

## UsersController
Endpoint-ы:
- `GET /api/v1/users`;
- `GET /api/v1/users/{userId}`;
- `GET /api/v1/users/working-now`;
- `GET /api/v1/users/{userId}/work-sessions`;
- `GET /api/v1/users/{userId}/coins`.

Сервис: `UserService`, `WorkSessionService`, `CoinService`.

## ObjectsController
Endpoint-ы:
- `GET /api/v1/objects`;
- `GET /api/v1/objects/{objectId}`;
- `GET /api/v1/objects/filters/finance`.

Сервис: `ObjectService`.

## TasksController
Endpoint-ы:
- `GET /api/v1/tasks`;
- `GET /api/v1/tasks/{taskId}`;
- `POST /api/v1/tasks`;
- `POST /api/v1/tasks/{taskId}/take`;
- `POST /api/v1/tasks/{taskId}/complete`.

Сервис: `TaskService`.

## TaskStepsController
Endpoint-ы:
- `GET /api/v1/tasks/{taskId}/steps`;
- `POST /api/v1/tasks/{taskId}/steps`;
- `POST /api/v1/task-steps/{stepId}/start`;
- `POST /api/v1/task-steps/{stepId}/complete`;
- `POST /api/v1/task-steps/{stepId}/cannot-do`.

Сервис: `StepService`.

## WorkSessionsController
Endpoint-ы:
- `GET /api/v1/work-sessions/current`;
- `POST /api/v1/work-sessions/start`;
- `POST /api/v1/work-sessions/{sessionId}/finish`.

Сервис: `WorkSessionService`.

## PhotosController
Endpoint-ы:
- `POST /api/v1/photos`;
- `GET /api/v1/photos/{photoId}`;
- `GET /api/v1/photos/{photoId}/view`.

Сервис: `PhotoService`.

Особенность: `POST /photos` использует `multipart/form-data`.

## CoinsController
Endpoint-ы:
- `GET /api/v1/coins/balance`;
- `GET /api/v1/coins/summary`.

Сервис: `CoinService`.

## FinanceController
Endpoint-ы:
- `GET /api/v1/finance/summary`;
- `GET /api/v1/finance/analytics`;
- `GET /api/v1/finance/employees/{employeeId}/details`;
- `GET /api/v1/finance/payments/draft`;
- `POST /api/v1/finance/payments`;
- `GET /api/v1/finance/payments/history`;
- `GET /api/v1/finance/reports`.

Сервис: `FinanceService`.

## AIRecommendationsController
Endpoint-ы:
- `GET /api/v1/ai-recommendations`;
- `GET /api/v1/ai-recommendations/{recommendationId}`;
- `POST /api/v1/ai-recommendations/{recommendationId}/view`;
- `POST /api/v1/ai-recommendations/{recommendationId}/decision`.

Сервис: `AIService`.

## NotificationsController
Endpoint-ы:
- `GET /api/v1/notifications`;
- `POST /api/v1/notifications/{notificationId}/read`;
- `POST /api/v1/notifications/{notificationId}/resolve`.

Сервис: `NotificationService`.

## Правила контроллеров
- Всегда передавать сервису `requestContext`.
- Не читать `companyId` из body для обычных доменных действий.
- Возвращать ответ в формате API Bible.
- Ошибки передавать в centralized exception middleware.
