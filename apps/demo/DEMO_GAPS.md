# DEMO_GAPS

Demo panel использует только существующие backend API. Новые endpoints в этой миссии не добавлялись.

## Недостающие API для чистого рабочего сценария монтажника

1. `GET /api/v1/tasks/my`

   Нужен endpoint для списка задач текущего `WORKER`. Сейчас `GET /api/v1/tasks` доступен `CREATOR`, `DIRECTOR`, `FOREMAN`, `FINANCE`, но не `WORKER`.

2. `GET /api/v1/events` для `WORKER` или отдельная лента событий рабочего места

   Сейчас история событий доступна менеджерским ролям и `FINANCE`. В demo panel история событий работает под `CREATOR`, `DIRECTOR`, `FOREMAN`, но не под чистым `WORKER`.

3. Demo seed/bootstrap flow

   В пустой базе нет пользователя, задачи и этапа. Для полного ручного прохода сейчас нужен заранее созданный пользователь и либо существующая задача, либо вход под ролью, которая может создать демо-задачу через существующий `POST /api/v1/tasks`.

## Что не считается gap

- Загрузка фото доступна через существующий `POST /api/v1/artifacts/photos`.
- Фото связывается с событием `PHOTO_UPLOADED` на backend.
- Task и TaskStep lifecycle уже доступны существующими endpoints.
