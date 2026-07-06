# 022 — Scalability

## Назначение
Документ описывает масштабирование Flutter-приложения на множество компаний, объектов, пользователей, новых модулей и будущих ролей.

## Множество компаний
Frontend не выбирает `companyId` как источник истины. Company scope приходит из JWT/backend. Local cache должен быть разделен по user/company.

## Большое число объектов
Списки объектов используют поиск, фильтры и pagination. Аналитические экраны не загружают все объекты без необходимости.

## Тысячи пользователей
Списки сотрудников используют pagination, search и lazy loading. Карточка сотрудника загружает детали отдельно.

## Новые модули
Новый модуль добавляется как feature:
- presentation;
- application state;
- domain use cases;
- data repository;
- route;
- tests.

Новый модуль не должен менять существующую бизнес-логику.

## Будущие роли
Новая роль добавляется только после обновления Product Bible, User Roles, API, Backend и UI Bible. Frontend не создает роль самостоятельно.

## Navigation scalability
Role navigation строится из конфигурации, основанной на backend role и UI Bible. Маршруты типизированы и защищены guards.

## State scalability
Feature state должен быть изолирован. Глобальное состояние хранит только session, роль, connectivity и общие counters.

## API scalability
API client поддерживает:
- pagination;
- cancellation;
- retry;
- token refresh;
- typed errors;
- multipart upload.

## Критерии готовности
Frontend готов к масштабированию, если:
- role-based UI централизован;
- Design System не дублируется в каждом feature;
- API client единый;
- local cache разделен по user/company;
- offline queue безопасна;
- новые feature не ломают существующие маршруты.
