# 05 Backend

## Назначение
Backend Bible описывает серверную архитектуру НАШПРЯНИК.РФ. Раздел фиксирует, как backend реализует REST API `/api/v1`, JWT-аутентификацию, RBAC, сервисный слой, репозитории PostgreSQL, файловое хранилище, фоновые задачи, AI-интеграцию, уведомления, логирование, безопасность, тестирование и масштабирование.

Backend не вводит новую бизнес-логику. Он реализует правила из `00_Project`, UI Bible, Architecture Bible, Database Bible и API Bible.

## Документы
- `001_BACKEND_OVERVIEW.md` — общая backend-архитектура.
- `002_PROJECT_STRUCTURE.md` — структура каталогов.
- `003_SERVICES.md` — сервисный слой.
- `004_CONTROLLERS.md` — контроллеры и связь с REST API.
- `005_REPOSITORIES.md` — слой доступа к PostgreSQL.
- `006_AUTHENTICATION.md` — JWT, refresh token, logout, password reset.
- `007_AUTHORIZATION.md` — RBAC и права ролей.
- `008_MIDDLEWARE.md` — middleware.
- `009_FILE_STORAGE.md` — хранение фотографий.
- `010_BACKGROUND_JOBS.md` — фоновые задачи.
- `011_AI_INTEGRATION.md` — интеграция с AI.
- `012_NOTIFICATIONS.md` — in-app, push и email-каналы.
- `013_LOGGING.md` — логирование.
- `014_ERROR_HANDLING.md` — единая обработка ошибок.
- `015_CONFIGURATION.md` — конфигурация и secrets.
- `016_DEPLOYMENT.md` — деплой и окружения.
- `017_PERFORMANCE.md` — производительность.
- `018_SECURITY.md` — безопасность.
- `019_TESTING.md` — тестирование.
- `020_SCALABILITY.md` — масштабирование backend.

## Главные ограничения
- ИИ рекомендует, человек утверждает.
- Монеты начисляются только в статусе `На работе`.
- Фото загружается через `multipart/form-data`.
- Финансовые действия пишутся в `audit_log`.
- Backend всегда проверяет роль, даже если UI скрывает действие.
