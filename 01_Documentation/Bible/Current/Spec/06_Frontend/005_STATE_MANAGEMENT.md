# 005 — State Management

## Назначение
Документ описывает управление состоянием Flutter-приложения. Рекомендуемый подход — MVVM/BLoC с явными immutable states.

## Типы состояния

### Global state
Хранит:
- auth session;
- current user;
- role;
- company scope;
- connectivity;
- notification counters.

### Feature state
Хранит данные feature:
- список задач;
- текущая задача;
- этапы;
- смена;
- финансовая аналитика;
- AI-рекомендации.

### Screen state
Хранит UI-состояние конкретного экрана:
- selected filters;
- form fields;
- local validation;
- loading mode;
- retry action.

## Базовые states
- `Initial`;
- `Loading`;
- `Ready`;
- `Empty`;
- `Error`;
- `Offline`;
- `Saving`;
- `UploadingPhoto`;
- `DisabledAction`;
- `Conflict`.

## Обновления
State обновляется только через action/event:
- user intent;
- API response;
- local storage restore;
- connectivity change;
- notification open;
- upload progress.

## Ошибки
API error mapping переводит backend code в frontend state:
- `UNAUTHORIZED` → auth expired;
- `FORBIDDEN` → forbidden state;
- `VALIDATION_ERROR` → form errors;
- `CONFLICT` → conflict state;
- `PHOTO_UPLOAD_FAILED` → upload retry.

## Правила
- UI не должен вычислять бизнес-решения, которые принадлежат backend.
- Баланс монет обновляется из API response или синхронизированного event.
- Финансовое решение создается только после успешного API response.
- Offline queue не должна создавать дубль выплаты.
