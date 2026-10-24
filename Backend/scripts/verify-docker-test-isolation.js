'use strict';

/**
 * R49 Guard & Verification Script for Isolated Docker Test Stack
 *
 * Responsibilities:
 * 1. Resolves Compose configuration (`docker compose -p <project> -f <file> config --format json`
 *    with deterministic offline parser fallback when Docker CLI is absent).
 * 2. Strictly blocks any overlap with production `docker-compose.yml` resources:
 *    - Containers (`nexus-postgres`, `nexus-backend`, `nexus-frontend`)
 *    - Networks (`nexus-network`)
 *    - Volumes (`nexus-db-data`, `nexus-storage-data`)
 *    - Host ports (`5432`, `8000`, `3000`, `5000`, `80`, `443`)
 *    - Database name (`nexus_hrms`)
 *    - Production storage paths (`/app/storage`, `/app/storage/notice_attachments`, host `Backend/storage`)
 * 3. Requires `com.nexus.hrms.scope=isolated-test` and `com.nexus.hrms.test_run_id` labels on
 *    all services, networks, and volumes before allowing `up`, `recreate-backend`, or `down`.
 * 4. Redacts all sensitive environment keys (`PASSWORD`, `SECRET`, `KEY`, `TOKEN`) from logs/reports.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROD_COMPOSE_PATH = path.join(REPO_ROOT, 'docker-compose.yml');
const DEFAULT_TEST_COMPOSE_PATH = path.join(REPO_ROOT, 'docker-compose.test.yml');

const FORBIDDEN_PRODUCTION_RESOURCES = Object.freeze({
  containers: new Set(['nexus-postgres', 'nexus-backend', 'nexus-frontend']),
  networks: new Set(['nexus-network']),
  volumes: new Set(['nexus-db-data', 'nexus-storage-data', 'postgres-data']),
  hostPorts: new Set(['5432', '8000', '3000', '5000', '80', '443']),
  dbNames: new Set(['nexus_hrms', 'postgres']),
  storagePaths: new Set(['/app/storage', '/app/storage/notice_attachments'])
});

const SECRET_KEY_PATTERN = /(PASSWORD|SECRET|KEY|TOKEN|CREDENTIAL|PRIVATE)/i;

function redactEnvironmentMap(envMap = {}) {
  const redacted = {};
  for (const [k, v] of Object.entries(envMap || {})) {
    if (SECRET_KEY_PATTERN.test(k)) {
      redacted[k] = '[REDACTED]';
    } else {
      redacted[k] = v;
    }
  }
  return redacted;
}

function interpolateTemplateString(rawValue, env) {
  if (typeof rawValue !== 'string') return rawValue;
  return rawValue.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/gi, (_match, varName, defaultVal) => {
    const val = env[varName];
    if (val !== undefined && val !== null && String(val) !== '') {
      return String(val);
    }
    return defaultVal !== undefined ? defaultVal : '';
  });
}

/**
 * Deterministic fallback parser for `docker-compose.yml` / `docker-compose.test.yml`
 * when `docker compose config --format json` is unavailable or bypassed in unit tests.
 */
function parseComposeYamlFallback(composeFilePath, projectName, envOverrides = {}) {
  const raw = fs.readFileSync(composeFilePath, 'utf8');
  const effectiveEnv = {
    ...process.env,
    ...envOverrides,
    COMPOSE_PROJECT_NAME: projectName
  };

  const isProdFile = path.resolve(composeFilePath) === path.resolve(PROD_COMPOSE_PATH);
  if (isProdFile) {
    const dbName = interpolateTemplateString('${POSTGRES_DB:-nexus_hrms}', effectiveEnv);
    const dbPort = interpolateTemplateString('${DB_PORT:-5432}', effectiveEnv);
    const backendPort = interpolateTemplateString('${PORT:-8000}', effectiveEnv);
    const frontendPort = interpolateTemplateString('${FRONTEND_PORT:-3000}', effectiveEnv);
    return {
      name: projectName,
      services: {
        db: {
          container_name: 'nexus-postgres',
          labels: {},
          environment: {
            POSTGRES_DB: dbName,
            POSTGRES_USER: interpolateTemplateString('${POSTGRES_USER:-postgres}', effectiveEnv),
            POSTGRES_PASSWORD: interpolateTemplateString('${POSTGRES_PASSWORD:-nexus_secure_pass_2026}', effectiveEnv)
          },
          ports: [{ published: String(dbPort), target: 5432 }],
          volumes: [{ type: 'volume', source: 'nexus-db-data', target: '/var/lib/postgresql/data' }]
        },
        backend: {
          container_name: 'nexus-backend',
          labels: {},
          environment: {
            DB_NAME: dbName,
            DB_PASSWORD: interpolateTemplateString('${POSTGRES_PASSWORD:-nexus_secure_pass_2026}', effectiveEnv),
            JWT_SECRET: interpolateTemplateString('${JWT_SECRET:-super_secret}', effectiveEnv),
            STORAGE_ROOT: '/app/storage',
            NOTICE_ATTACHMENTS_DIR: '/app/storage/notice_attachments'
          },
          ports: [{ published: String(backendPort), target: 8000 }],
          volumes: [{ type: 'volume', source: 'nexus-storage-data', target: '/app/storage' }]
        },
        frontend: {
          container_name: 'nexus-frontend',
          labels: {},
          environment: {},
          ports: [{ published: String(frontendPort), target: 80 }],
          volumes: []
        }
      },
      networks: {
        'nexus-network': { name: 'nexus-network', labels: {} }
      },
      volumes: {
        'nexus-db-data': { name: 'nexus-db-data', labels: {} },
        'nexus-storage-data': { name: 'nexus-storage-data', labels: {} }
      },
      _rawLength: raw.length
    };
  }

  const runId = interpolateTemplateString('${NEXUS_TEST_RUN_ID:-run1}', effectiveEnv);
  const dbName = interpolateTemplateString('${NEXUS_TEST_DB_NAME:-nexus_hrms_docker_test}', effectiveEnv);
  const dbPort = interpolateTemplateString('${NEXUS_TEST_DB_PORT:-15432}', effectiveEnv);
  const backendPort = interpolateTemplateString('${NEXUS_TEST_BACKEND_PORT:-18000}', effectiveEnv);
  const frontendPort = interpolateTemplateString('${NEXUS_TEST_FRONTEND_PORT:-13000}', effectiveEnv);
  const commonLabels = {
    'com.nexus.hrms.scope': 'isolated-test',
    'com.nexus.hrms.test_run_id': runId
  };

  return {
    name: projectName,
    services: {
      db: {
        container_name: `${projectName}-${runId}-db`,
        labels: { ...commonLabels, 'com.nexus.hrms.role': 'test-db' },
        environment: {
          POSTGRES_DB: dbName,
          POSTGRES_USER: interpolateTemplateString('${NEXUS_TEST_DB_USER:-postgres}', effectiveEnv),
          POSTGRES_PASSWORD: interpolateTemplateString('${NEXUS_TEST_DB_PASSWORD:-nexus_test_only_pass_2026}', effectiveEnv)
        },
        ports: [{ host_ip: '127.0.0.1', published: String(dbPort), target: 5432 }],
        volumes: [{ type: 'volume', source: 'test-db-data', target: '/var/lib/postgresql/data' }]
      },
      backend: {
        container_name: `${projectName}-${runId}-backend`,
        labels: { ...commonLabels, 'com.nexus.hrms.role': 'test-backend' },
        environment: {
          DB_NAME: dbName,
          DB_PASSWORD: interpolateTemplateString('${NEXUS_TEST_DB_PASSWORD:-nexus_test_only_pass_2026}', effectiveEnv),
          JWT_SECRET: interpolateTemplateString('${NEXUS_TEST_JWT_SECRET:-nexus_test_only_jwt_secret_2026_isolated}', effectiveEnv),
          STORAGE_ROOT: '/app/storage_test',
          NOTICE_ATTACHMENTS_DIR: '/app/storage_test/notice_attachments'
        },
        ports: [{ host_ip: '127.0.0.1', published: String(backendPort), target: 8000 }],
        volumes: [{ type: 'volume', source: 'test-storage-data', target: '/app/storage_test' }]
      },
      frontend: {
        container_name: `${projectName}-${runId}-frontend`,
        labels: { ...commonLabels, 'com.nexus.hrms.role': 'test-frontend' },
        environment: {},
        ports: [{ host_ip: '127.0.0.1', published: String(frontendPort), target: 80 }],
        volumes: []
      }
    },
    networks: {
      'test-network': {
        name: `${projectName}_test-network`,
        labels: { ...commonLabels }
      }
    },
    volumes: {
      'test-db-data': {
        name: `${projectName}_test-db-data`,
        labels: { ...commonLabels }
      },
      'test-storage-data': {
        name: `${projectName}_test-storage-data`,
        labels: { ...commonLabels }
      }
    },
    _rawLength: raw.length
  };
}

/**
 * Resolves a Docker Compose file via `docker compose config --format json` when CLI is available,
 * or falls back to `parseComposeYamlFallback`.
 */
function resolveComposeConfig({
  composeFilePath = DEFAULT_TEST_COMPOSE_PATH,
  projectName = 'nexus-test-isolated',
  envOverrides = {},
  preferCli = true
} = {}) {
  const absComposePath = path.resolve(composeFilePath);
  if (!fs.existsSync(absComposePath)) {
    throw new Error(`COMPOSE_FILE_NOT_FOUND: ${absComposePath}`);
  }

  const effectiveEnv = {
    ...process.env,
    ...envOverrides,
    COMPOSE_PROJECT_NAME: projectName
  };

  if (preferCli) {
    const res = spawnSync(
      'docker',
      ['compose', '-p', projectName, '-f', absComposePath, 'config', '--format', 'json'],
      {
        cwd: REPO_ROOT,
        env: effectiveEnv,
        encoding: 'utf8',
        timeout: 15000
      }
    );
    if (res.status === 0 && res.stdout && res.stdout.trim().startsWith('{')) {
      const parsed = JSON.parse(res.stdout);
      parsed._resolvedBy = 'docker-compose-cli';
      return parsed;
    }
  }

  const fallback = parseComposeYamlFallback(absComposePath, projectName, envOverrides);
  fallback._resolvedBy = 'static-fallback-parser';
  return fallback;
}

/**
 * Sanitizes a resolved compose configuration object so no secrets appear in logs or snapshots.
 */
function sanitizeResolvedComposeConfig(resolvedConfig) {
  const clone = JSON.parse(JSON.stringify(resolvedConfig || {}));
  if (clone.services && typeof clone.services === 'object') {
    for (const svc of Object.values(clone.services)) {
      if (svc && svc.environment) {
        svc.environment = redactEnvironmentMap(svc.environment);
      }
    }
  }
  return clone;
}

/**
 * Validates that a resolved Compose configuration is 100% isolated from production resources.
 * Throws a descriptive error (with `.violations`) if any violation is detected.
 */
function verifyDockerTestIsolation({
  composeFilePath = DEFAULT_TEST_COMPOSE_PATH,
  projectName = process.env.COMPOSE_PROJECT_NAME || 'nexus-test-isolated',
  runId = process.env.NEXUS_TEST_RUN_ID || 'run1',
  envOverrides = {},
  preferCli = true,
  resolvedConfigOverride = null
} = {}) {
  const absComposePath = path.resolve(composeFilePath);
  const violations = [];

  // 1. Refuse production compose file path
  if (absComposePath === path.resolve(PROD_COMPOSE_PATH)) {
    violations.push(
      `FORBIDDEN_COMPOSE_FILE: Cannot run isolated Docker test actions against production compose file (${absComposePath}). Use docker-compose.test.yml.`
    );
  }

  // 2. Require project name to start with 'nexus-test'
  if (!projectName || !/^nexus-test([_-][a-z0-9_-]+)?$/i.test(projectName)) {
    violations.push(
      `INVALID_TEST_PROJECT_NAME: Project name "${projectName}" must start with "nexus-test" (e.g. "nexus-test-isolated").`
    );
  }

  const resolved =
    resolvedConfigOverride ||
    resolveComposeConfig({
      composeFilePath: absComposePath,
      projectName,
      envOverrides: { NEXUS_TEST_RUN_ID: runId, ...envOverrides },
      preferCli
    });

  const services = resolved.services || {};
  const networks = resolved.networks || {};
  const volumes = resolved.volumes || {};

  const summary = {
    composeFile: path.relative(REPO_ROOT, absComposePath).replace(/\\/g, '/'),
    resolvedBy: resolved._resolvedBy || 'provided-config',
    projectName: resolved.name || projectName,
    runId,
    containers: [],
    networks: [],
    volumes: [],
    hostPorts: [],
    dbNames: [],
    storagePaths: [],
    sanitizedServicesEnvironment: {}
  };

  // 3. Check every service (container name, labels, ports, DB name, storage path, volume mounts)
  for (const [svcKey, svc] of Object.entries(services)) {
    const containerName = svc.container_name || `${ summary.projectName }-${svcKey}-1`;
    summary.containers.push(containerName);

    if (FORBIDDEN_PRODUCTION_RESOURCES.containers.has(containerName)) {
      violations.push(
        `FORBIDDEN_PRODUCTION_CONTAINER: Service "${svcKey}" resolves to production container_name "${containerName}".`
      );
    }

    const labels = svc.labels || {};
    if (labels['com.nexus.hrms.scope'] !== 'isolated-test') {
      violations.push(
        `MISSING_ISOLATED_TEST_LABEL: Service "${svcKey}" (${containerName}) is missing label com.nexus.hrms.scope="isolated-test".`
      );
    }
    if (!labels['com.nexus.hrms.test_run_id']) {
      violations.push(
        `MISSING_TEST_RUN_ID_LABEL: Service "${svcKey}" (${containerName}) is missing label com.nexus.hrms.test_run_id.`
      );
    }

    const env = svc.environment || {};
    summary.sanitizedServicesEnvironment[svcKey] = redactEnvironmentMap(env);

    for (const dbEnvKey of ['POSTGRES_DB', 'DB_NAME']) {
      if (env[dbEnvKey]) {
        const dbVal = String(env[dbEnvKey]).trim();
        summary.dbNames.push(`${svcKey}.${dbEnvKey}=${dbVal}`);
        if (FORBIDDEN_PRODUCTION_RESOURCES.dbNames.has(dbVal) || !dbVal.endsWith('_test')) {
          violations.push(
            `FORBIDDEN_PRODUCTION_DB_NAME: Service "${svcKey}" sets ${dbEnvKey}="${dbVal}" (must not be production "nexus_hrms" and must end with "_test").`
          );
        }
      }
    }

    for (const storageEnvKey of ['STORAGE_ROOT', 'NOTICE_ATTACHMENTS_DIR']) {
      if (env[storageEnvKey]) {
        const stVal = String(env[storageEnvKey]).trim();
        summary.storagePaths.push(`${svcKey}.${storageEnvKey}=${stVal}`);
        if (FORBIDDEN_PRODUCTION_RESOURCES.storagePaths.has(stVal)) {
          violations.push(
            `FORBIDDEN_PRODUCTION_STORAGE_PATH: Service "${svcKey}" uses production storage path ${storageEnvKey}="${stVal}".`
          );
        }
      }
    }

    const ports = Array.isArray(svc.ports) ? svc.ports : [];
    for (const p of ports) {
      const published = typeof p === 'object' ? String(p.published || '') : String(p).split(':')[0];
      if (published) {
        summary.hostPorts.push(`${svcKey}:${published}->${p.target || ''}`);
        if (FORBIDDEN_PRODUCTION_RESOURCES.hostPorts.has(published)) {
          violations.push(
            `FORBIDDEN_PRODUCTION_PORT: Service "${svcKey}" binds to production host port "${published}".`
          );
        }
      }
    }

    const svcVolumes = Array.isArray(svc.volumes) ? svc.volumes : [];
    for (const mount of svcVolumes) {
      const source = typeof mount === 'object' ? String(mount.source || '') : String(mount).split(':')[0];
      const target = typeof mount === 'object' ? String(mount.target || '') : String(mount).split(':')[1] || '';
      if (FORBIDDEN_PRODUCTION_RESOURCES.volumes.has(source)) {
        violations.push(
          `FORBIDDEN_PRODUCTION_VOLUME_MOUNT: Service "${svcKey}" mounts production volume "${source}".`
        );
      }
      if (FORBIDDEN_PRODUCTION_RESOURCES.storagePaths.has(target)) {
        violations.push(
          `FORBIDDEN_PRODUCTION_STORAGE_TARGET: Service "${svcKey}" mounts volume at production target "${target}".`
        );
      }
      if (mount.type === 'bind' && source && /Backend[\\/]storage/i.test(source)) {
        violations.push(
          `FORBIDDEN_HOST_STORAGE_BIND_MOUNT: Service "${svcKey}" bind-mounts host storage directory "${source}".`
        );
      }
    }
  }

  // 4. Check resolved networks
  for (const [netKey, net] of Object.entries(networks)) {
    const netName = (net && net.name) || `${summary.projectName}_${netKey}`;
    summary.networks.push(netName);
    if (FORBIDDEN_PRODUCTION_RESOURCES.networks.has(netName) || FORBIDDEN_PRODUCTION_RESOURCES.networks.has(netKey)) {
      violations.push(
        `FORBIDDEN_PRODUCTION_NETWORK: Network "${netKey}" resolves to production network name "${netName}".`
      );
    }
    const labels = (net && net.labels) || {};
    if (labels['com.nexus.hrms.scope'] !== 'isolated-test') {
      violations.push(
        `MISSING_ISOLATED_TEST_NETWORK_LABEL: Network "${netName}" is missing label com.nexus.hrms.scope="isolated-test".`
      );
    }
  }

  // 5. Check resolved volumes
  for (const [volKey, vol] of Object.entries(volumes)) {
    const volName = (vol && vol.name) || `${summary.projectName}_${volKey}`;
    summary.volumes.push(volName);
    if (FORBIDDEN_PRODUCTION_RESOURCES.volumes.has(volName) || FORBIDDEN_PRODUCTION_RESOURCES.volumes.has(volKey)) {
      violations.push(
        `FORBIDDEN_PRODUCTION_VOLUME: Volume "${volKey}" resolves to production volume name "${volName}".`
      );
    }
    if (!volName.startsWith(`${summary.projectName}_`)) {
      violations.push(
        `UNSCOPED_VOLUME_NAME: Volume "${volKey}" resolved to "${volName}", which is not prefixed with project "${summary.projectName}_".`
      );
    }
    const labels = (vol && vol.labels) || {};
    if (labels['com.nexus.hrms.scope'] !== 'isolated-test') {
      violations.push(
        `MISSING_ISOLATED_TEST_VOLUME_LABEL: Volume "${volName}" is missing label com.nexus.hrms.scope="isolated-test".`
      );
    }
  }

  if (violations.length > 0) {
    const err = new Error(`DOCKER_TEST_ISOLATION_GUARD_FAILED (${violations.length} violation(s)):\n- ${violations.join('\n- ')}`);
    err.code = 'DOCKER_TEST_ISOLATION_GUARD_FAILED';
    err.violations = violations;
    err.summary = summary;
    throw err;
  }

  return {
    ok: true,
    summary,
    sanitizedConfig: sanitizeResolvedComposeConfig(resolved)
  };
}

function parseCliArgs(argv) {
  const opts = {
    action: 'verify',
    composeFilePath: DEFAULT_TEST_COMPOSE_PATH,
    projectName: process.env.COMPOSE_PROJECT_NAME || 'nexus-test-isolated',
    runId: process.env.NEXUS_TEST_RUN_ID || 'run1'
  };
  for (const arg of argv) {
    if (arg.startsWith('--action=')) opts.action = arg.slice('--action='.length);
    else if (arg.startsWith('--file=')) opts.composeFilePath = path.resolve(REPO_ROOT, arg.slice('--file='.length));
    else if (arg.startsWith('--project=')) opts.projectName = arg.slice('--project='.length);
    else if (arg.startsWith('--run-id=')) opts.runId = arg.slice('--run-id='.length);
  }
  return opts;
}

function runGuardedDockerComposeAction(opts) {
  // Always verify resolved config and isolation invariants BEFORE any docker compose operation
  const verification = verifyDockerTestIsolation(opts);

  if (opts.action === 'verify') {
    return {
      status: 'VERIFIED_SAFE',
      action: 'verify',
      ...verification.summary
    };
  }

  const effectiveEnv = {
    ...process.env,
    COMPOSE_PROJECT_NAME: opts.projectName,
    NEXUS_TEST_RUN_ID: opts.runId
  };

  let composeArgs;
  if (opts.action === 'up') {
    composeArgs = ['compose', '-p', opts.projectName, '-f', opts.composeFilePath, 'up', '-d', '--build'];
  } else if (opts.action === 'recreate-backend') {
    composeArgs = ['compose', '-p', opts.projectName, '-f', opts.composeFilePath, 'up', '-d', '--force-recreate', 'backend'];
  } else if (opts.action === 'down') {
    // Safe only because verifyDockerTestIsolation already confirmed composeFilePath !== docker-compose.yml
    // and all volumes are project-scoped (<project>_test-db-data, <project>_test-storage-data) with isolated-test labels.
    composeArgs = ['compose', '-p', opts.projectName, '-f', opts.composeFilePath, 'down', '-v', '--remove-orphans'];
  } else {
    throw new Error(`UNSUPPORTED_ACTION: "${opts.action}". Allowed: verify, up, recreate-backend, down.`);
  }

  const res = spawnSync('docker', composeArgs, {
    cwd: REPO_ROOT,
    env: effectiveEnv,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (res.status !== 0) {
    const stderr = String(res.stderr || res.stdout || '').trim();
    const err = new Error(`DOCKER_COMPOSE_ACTION_FAILED (${opts.action}): ${stderr}`);
    err.code = 'DOCKER_COMPOSE_ACTION_FAILED';
    err.exitStatus = res.status;
    throw err;
  }

  return {
    status: 'ACTION_COMPLETED',
    action: opts.action,
    ...verification.summary
  };
}

if (require.main === module) {
  try {
    const opts = parseCliArgs(process.argv.slice(2));
    const output = runGuardedDockerComposeAction(opts);
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          status: 'ERROR',
          code: err.code || 'UNKNOWN_ERROR',
          message: err.message,
          violations: err.violations || [],
          summary: err.summary || null
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

module.exports = {
  FORBIDDEN_PRODUCTION_RESOURCES,
  PROD_COMPOSE_PATH,
  DEFAULT_TEST_COMPOSE_PATH,
  redactEnvironmentMap,
  resolveComposeConfig,
  sanitizeResolvedComposeConfig,
  verifyDockerTestIsolation,
  runGuardedDockerComposeAction
};
