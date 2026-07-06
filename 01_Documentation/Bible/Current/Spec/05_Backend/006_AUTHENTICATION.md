# 006 — Authentication

## Назначение
Документ описывает JWT-аутентификацию, refresh token, logout и password reset.

## Access Token
Access token — JWT для защищенных API-запросов.

Payload:

```json
{
  "sub": "8d32b7d6-8a0d-4d7c-a49d-f8a1a0aa6f41",
  "companyId": "1d6cbb51-bf41-4c6d-a1e9-0a8c1d6b9f30",
  "role": "worker",
  "iat": 1783340000,
  "exp": 1783343600
}
```

## Refresh Token
Refresh token используется для получения нового access token. Он хранится безопасно и может быть отозван при logout.

## Login flow
1. Пользователь отправляет `POST /api/v1/auth/login`.
2. Backend проверяет учетные данные.
3. Backend проверяет `users.is_active`.
4. Backend выдает access token и refresh token.
5. Backend возвращает роль и стартовый экран.
6. Audit фиксирует login-событие.

## Refresh flow
1. Клиент отправляет refresh token.
2. Backend проверяет подпись, срок и отзыв.
3. Backend выдает новую пару токенов.

## Logout flow
1. Клиент вызывает `POST /api/v1/auth/logout`.
2. Backend отзывает refresh token.
3. Клиент удаляет access token.
4. Audit фиксирует logout.

## Password Reset
Password reset допускается как backend-сценарий учетной записи. Он не меняет бизнес-логику ролей.

Поток:
1. Пользователь запрашивает сброс.
2. Backend создает одноразовый token.
3. Token доставляется разрешенным каналом.
4. Пользователь задает новый пароль.
5. Backend сохраняет новый `password_hash`.

## Безопасность паролей
- Пароль хранится только как hash.
- Hash использует стойкий алгоритм.
- Ошибки login не должны раскрывать, существует ли пользователь.

## Связь с API
- `002_AUTH_API.md`.
- `013_ERRORS.md`.
- `014_PERMISSIONS.md`.

## Связь с БД
- `users`;
- таблица refresh tokens, если реализована;
- `audit_log`.
