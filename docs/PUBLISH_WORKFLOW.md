# Контролируемая публикация

## Этап 1

```bash
npm run publish:check
npm run publish -- --dry-run
```

`publish:check` проверяет Git, миграции, package lock, Prisma, тесты, lint, build, локальные
health endpoints, production backup readiness и последний успешный restore-check. Команда не
делает commit, push или deploy. Dry-run только показывает файлы, сообщение commit, remote,
сервер, будущий backup, deploy, health-check и rollback.

## Этап 2

Только после точного сообщения `Утверждаю. Публикуй в боевую версию.` оператор повторяет
проверки и запускает утверждённый процесс. Флаг `--approved` — дополнительный технический
предохранитель и не заменяет утверждение:

```bash
npm run publish -- --approved --message "понятное сообщение"
```

Порядок: commit, push `main`, атомарный backup, checksum, скачивание, изолированный restore,
фиксация production HEAD, проверка чистого дерева сервера, `deploy.sh`, systemd, Nginx, сайт,
API `/api/health` и Docker health. Все операции имеют timeout.

Миграции с `DROP`, `DELETE`, опасным `ALTER`, сменой типа или обязательным полем без default
блокируются до отдельного согласования. Автоматический откат миграций запрещён.
