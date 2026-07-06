# 007 — Authentication

## Назначение
Документ описывает login, logout, refresh, session и remember me в Flutter-приложении.

## Login
1. Пользователь вводит данные на `000_Login`.
2. Форма валидирует обязательные поля.
3. API client вызывает `POST /api/v1/auth/login`.
4. Приложение сохраняет token-ы в secure storage.
5. App открывает стартовый экран роли из response.

## Logout
1. Пользователь нажимает logout.
2. App вызывает `POST /api/v1/auth/logout`.
3. Локальные token-ы удаляются.
4. Offline queue для защищенных действий останавливается.
5. Пользователь возвращается на `/login`.

## Refresh
Access token обновляется через refresh token. Если refresh token недействителен, пользователь возвращается на login.

## Session restore
При запуске:
1. App читает secure storage.
2. Проверяет наличие token.
3. Вызывает `/auth/me`.
4. Восстанавливает global state.
5. Открывает стартовый экран роли.

## Remember Me
Remember me означает сохранение refresh token в secure storage. Это не отменяет JWT expiry и backend-проверку.

## Security
- Token не хранится в plain preferences.
- Token не логируется.
- После logout protected routes закрываются.
- Role берется из backend/JWT, а не из локального UI.
