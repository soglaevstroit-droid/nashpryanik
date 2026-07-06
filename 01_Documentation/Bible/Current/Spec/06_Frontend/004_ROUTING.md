# 004 — Routing

## Назначение
Routing определяет маршруты, protected routes, role routing и deep links.

## Route naming
Маршруты должны быть стабильными и связаны с UI Bible:

```text
/login
/worker/main
/worker/tasks/:taskId
/worker/tasks/:taskId/steps/:stepId
/foreman/employees
/foreman/tasks/create
/finance/main
/finance/employees/:employeeId
/finance/payments
```

## Protected Routes
Protected route проверяет:
- наличие access token;
- валидную session state;
- роль пользователя;
- required params.

Если пользователь не авторизован, он отправляется на `/login`.

## Role Routing
После login app получает `role` и `startScreen` от backend.

Mapping:
- `worker` → `/worker/main`;
- `foreman` → `/foreman/employees`;
- `finance` → `/finance/main`;
- `manager` → доступ только к разрешенной управленческой аналитике, если она описана backend и UI Bible.

## Deep Links
Deep link должен проходить auth и RBAC guards.

Примеры:
- уведомление AI → `/finance/ai-recommendations/:recommendationId`;
- готовая выплата → `/finance/payments?recommendationId=...`;
- сотрудник → `/finance/employees/:employeeId`.

Если роль не имеет доступа, показывается error state и безопасный переход на стартовый экран роли.

## Route Guards
- `AuthGuard`;
- `RoleGuard`;
- `ContextGuard`;
- `OfflineGuard` для действий, которые нельзя выполнить offline;
- `UnsavedChangesGuard` для настроек и форм.

## Ошибки routing
Ошибки routing не должны открывать чужие данные. Если `taskId`, `employeeId` или `paymentId` недоступны, frontend показывает `FORBIDDEN` или `NOT_FOUND` из API.
