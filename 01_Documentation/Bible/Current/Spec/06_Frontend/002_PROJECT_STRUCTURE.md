# 002 — Project Structure

## Назначение
Документ описывает структуру каталогов Flutter-приложения.

## Корневая структура

```text
lib/
  app/
  core/
  features/
  shared/
  widgets/
  services/
  api/
  models/
  repositories/
  routing/
  theme/
  utils/
  localization/
```

## `app`
Точка сборки приложения:
- app root;
- dependency injection;
- global providers;
- lifecycle observers;
- app bootstrap.

## `core`
Общие технические блоки:
- result type;
- exceptions;
- request context;
- constants;
- connectivity;
- secure storage wrapper;
- logging facade.

## `features`
Feature-first модули:
- `auth`;
- `worker`;
- `foreman`;
- `finance`;
- `tasks`;
- `task_steps`;
- `work_sessions`;
- `photos`;
- `notifications`;
- `settings`.

## `shared`
Переиспользуемые доменные элементы:
- common DTO;
- pagination;
- API error models;
- date range model;
- role model;
- status models.

## `widgets`
Общие UI widgets на базе Design System:
- app scaffold;
- cards;
- buttons;
- status badge;
- loading skeleton;
- error view;
- empty state;
- photo picker block;
- bottom navigation.

## `services`
Клиентские сервисы:
- connectivity;
- photo compression;
- upload queue;
- notification handling;
- local sync;
- analytics events.

## `api`
HTTP client, interceptors, auth refresh, serializers и generated или ручные API adapters.

## `models`
DTO и view models. DTO соответствуют API Bible, view models соответствуют экранным потребностям UI Bible.

## `repositories`
Frontend repositories объединяют API и local storage. Они не являются backend repositories и не содержат SQL.

## `routing`
Route definitions, guards, deep links, protected routes, role routing.

## `theme`
Flutter theme, Design System tokens, colors, typography, spacing, component styles.

## `utils`
Форматирование дат, чисел, монет, длительности, безопасные helpers.

## `localization`
Тексты интерфейса. Тексты должны соответствовать UI Bible и не добавлять новые сценарии.
