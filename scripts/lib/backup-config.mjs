export const CONFIG = Object.freeze({
  sshAlias: 'stroit-server',
  sshFallback: 'root@176.125.242.120',
  projectDirectory: '/root/nashpryanik',
  backupDirectory: '/root/backups/postgres',
  localBackupDirectory: 'backup/stroit_dev',
  container: 'stroit-postgres',
  database: 'stroit_dev',
  databaseUser: 'stroit',
  restorePrefix: 'stroit_restore_check_',
  backupPattern: /^(?:stroit|stroit_dev)[-_]\d{8}(?:T|-)\d{6}Z?\.(?:sql\.gz|dump)$/,
  timeouts: {
    ssh: 15_000,
    readOnly: 30_000,
    backup: 600_000,
    restore: 600_000,
    deploy: 900_000,
    health: 60_000,
  },
});

export const FORBIDDEN_PRODUCTION_DATABASE = 'stroit_dev';
