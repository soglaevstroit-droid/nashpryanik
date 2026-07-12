# Безопасный rollback

До deploy сохраняется `PREVIOUS_PRODUCTION_COMMIT`. При ошибке deploy или health выполняется
только code rollback к этому точному 40-символьному commit: зависимости, Prisma generate,
backend build, перезапуск сервисов и повторный `/api/health`.

Rollback не удаляет и не откатывает миграции. Если миграция уже применена и несовместима со
старым кодом, автоматический rollback опасен: процесс должен остановиться и потребовать решения
пользователя. Нельзя применять `prisma migrate reset`, `db push --accept-data-loss`, restore
поверх `stroit_dev` или ручные destructive SQL-команды.
