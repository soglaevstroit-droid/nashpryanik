# infra/redis

Назначение: будущая инфраструктурная зона Redis.

Источник истины:

- `TECH_STACK_DECISION.md`
- `INFRASTRUCTURE_MASTER_PLAN.md`

Redis используется для cache, session, queue и rate limiting. На текущем этапе создается только локальный Docker Compose сервис без прикладных очередей и без backend-интеграции.
