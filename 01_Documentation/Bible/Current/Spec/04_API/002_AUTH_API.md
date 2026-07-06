# 002 — Auth API

## Назначение
Auth API авторизует пользователя, выдает JWT и возвращает стартовый экран согласно роли.

## Endpoint: login

```http
POST /api/v1/auth/login
```

## Request body

```json
{
  "phone": "+79990000000",
  "password": "secure-password"
}
```

## Response body

```json
{
  "data": {
    "accessToken": "jwt.access.token",
    "refreshToken": "jwt.refresh.token",
    "user": {
      "id": "0f9a5cf8-2e65-45e0-9df1-7b2e52f94411",
      "companyId": "1d6cbb51-bf41-4c6d-a1e9-0a8c1d6b9f30",
      "role": "worker",
      "fullName": "Иван Петров",
      "workStatus": "left",
      "startScreen": "001_Worker_Main"
    }
  },
  "meta": {
    "requestId": "req_auth_login_001"
  }
}
```

## Endpoint: refresh

```http
POST /api/v1/auth/refresh
```

## Request body

```json
{
  "refreshToken": "jwt.refresh.token"
}
```

## Response body

```json
{
  "data": {
    "accessToken": "new.jwt.access.token",
    "refreshToken": "new.jwt.refresh.token"
  },
  "meta": {
    "requestId": "req_auth_refresh_001"
  }
}
```

## Endpoint: me

```http
GET /api/v1/auth/me
```

## Response body

```json
{
  "data": {
    "id": "0f9a5cf8-2e65-45e0-9df1-7b2e52f94411",
    "companyId": "1d6cbb51-bf41-4c6d-a1e9-0a8c1d6b9f30",
    "role": "finance",
    "fullName": "Мария Финансова",
    "workStatus": "left"
  },
  "meta": {
    "requestId": "req_auth_me_001"
  }
}
```

## Endpoint: logout

```http
POST /api/v1/auth/logout
```

## Response body

```json
{
  "data": {
    "loggedOut": true
  },
  "meta": {
    "requestId": "req_auth_logout_001"
  }
}
```

## Ошибки
- `INVALID_CREDENTIALS`.
- `TOKEN_EXPIRED`.
- `TOKEN_INVALID`.
- `USER_INACTIVE`.

## Права доступа
Login доступен без JWT. Остальные endpoint-ы требуют JWT.

## Связь с таблицами
- `users`;
- `companies`;
- `audit_log`.

## Связь с UI
- `000_Login`;
- стартовые экраны ролей: `001_Worker_Main`, `015_Foreman_Employees`, `029_Finance_Main`.
