# 018 — Security

## Назначение
Документ описывает требования безопасности backend с учетом OWASP, JWT, файлов, API и финансовых действий.

## JWT
- Access token короткоживущий.
- Refresh token отзывается при logout.
- Secrets не хранятся в git.
- Backend проверяет подпись и срок токена.

## RBAC
Каждый защищенный endpoint проверяет роль. UI не является защитой.

## Company isolation
Все запросы фильтруются по `companyId` из JWT. Клиентский `companyId` не используется как источник истины.

## OWASP
Backend должен защищаться от:
- injection через параметризованные запросы;
- broken authentication;
- broken access control;
- insecure file upload;
- sensitive data exposure;
- security misconfiguration;
- insufficient logging.

## Файлы
- Проверять MIME type и размер.
- Не исполнять загруженные файлы.
- Использовать безопасные storage keys.
- Ограничивать доступ к файлам JWT или signed URL.

## API
- Rate limit.
- Request validation.
- Единый error format без stack trace.
- CORS только для доверенных origin.
- HTTPS в production.

## Финансы
- Выплату создает только `finance`.
- ИИ не утверждает выплату.
- Повторная выплата блокируется.
- Финансовые действия пишутся в `audit_log`.

## Логи
Не логировать пароли, токены, secrets и полное содержимое файлов.
