# 017 — OpenAPI Structure

## Назначение
Документ описывает структуру OpenAPI-спецификации для REST API НАШПРЯНИК.РФ.

## Файл
Рекомендуемый файл спецификации:

```text
openapi.yaml
```

## Базовая структура

```yaml
openapi: 3.1.0
info:
  title: НАШПРЯНИК.РФ API
  version: 1.0.0
servers:
  - url: /api/v1
security:
  - bearerAuth: []
paths: {}
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

## Группы tags
- `Auth`;
- `Users`;
- `Objects`;
- `Tasks`;
- `TaskSteps`;
- `WorkSessions`;
- `Photos`;
- `Coins`;
- `Finance`;
- `AIRecommendations`;
- `Notifications`;
- `Errors`.

## Общие schemas

```yaml
ErrorResponse:
  type: object
  required: [error]
  properties:
    error:
      type: object
      required: [code, message, requestId]
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: object
        requestId:
          type: string
```

## Пример path

```yaml
/tasks/{taskId}/take:
  post:
    tags: [Tasks]
    summary: Взять задачу в работу
    security:
      - bearerAuth: []
    parameters:
      - name: taskId
        in: path
        required: true
        schema:
          type: string
          format: uuid
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [workSessionId]
            properties:
              workSessionId:
                type: string
                format: uuid
    responses:
      "200":
        description: Задача взята
      "403":
        description: Нет прав
      "409":
        description: У сотрудника уже есть активная задача
```

## Multipart для фото

```yaml
/photos:
  post:
    tags: [Photos]
    requestBody:
      required: true
      content:
        multipart/form-data:
          schema:
            type: object
            required: [file, photoType]
            properties:
              file:
                type: string
                format: binary
              photoType:
                type: string
```

## Требования к OpenAPI
- Каждый endpoint должен иметь security.
- Каждый request и response должен иметь schema.
- Ошибки должны ссылаться на `ErrorResponse`.
- Все UUID должны иметь `format: uuid`.
- Все даты времени должны использовать `date-time`.
- Все endpoint-ы должны начинаться с `/api/v1` на уровне server.
