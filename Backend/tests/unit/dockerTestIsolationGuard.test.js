'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROD_COMPOSE_PATH,
  DEFAULT_TEST_COMPOSE_PATH,
  redactEnvironmentMap,
  verifyDockerTestIsolation,
  runGuardedDockerComposeAction
} = require('../../scripts/verify-docker-test-isolation');

test('R49-1: isolated docker-compose.test.yml resolves distinct resources, labels, ports, DB, storage and redacts secrets', () => {
  for (const preferCli of [true, false]) {
    const result = verifyDockerTestIsolation({
      composeFilePath: DEFAULT_TEST_COMPOSE_PATH,
      projectName: 'nexus-test-r49unit',
      runId: 'run49',
      preferCli
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.projectName, 'nexus-test-r49unit');
    assert.equal(result.summary.runId, 'run49');

    // Containers must be scoped and never match production names
    assert.deepEqual(
      [...result.summary.containers].sort(),
      [
        'nexus-test-r49unit-run49-backend',
        'nexus-test-r49unit-run49-db',
        'nexus-test-r49unit-run49-frontend'
      ]
    );

    // Networks and volumes must be project-prefixed and distinct from production
    assert.deepEqual(result.summary.networks, ['nexus-test-r49unit_test-network']);
    assert.deepEqual(
      [...result.summary.volumes].sort(),
      ['nexus-test-r49unit_test-db-data', 'nexus-test-r49unit_test-storage-data']
    );

    // Ports must be isolated test ports (15432, 18000, 13000), never 5432/8000/3000/80
    assert.ok(result.summary.hostPorts.some((p) => p.includes('15432->5432')));
    assert.ok(result.summary.hostPorts.some((p) => p.includes('18000->8000')));
    assert.ok(result.summary.hostPorts.some((p) => p.includes('13000->80')));

    // Database and storage must be isolated test targets
    assert.ok(result.summary.dbNames.every((d) => d.endsWith('=nexus_hrms_docker_test')));
    assert.ok(result.summary.storagePaths.includes('backend.STORAGE_ROOT=/app/storage_test'));
    assert.ok(
      result.summary.storagePaths.includes('backend.NOTICE_ATTACHMENTS_DIR=/app/storage_test/notice_attachments')
    );

    // Secrets must never appear in sanitized output
    const backendEnv = result.summary.sanitizedServicesEnvironment.backend;
    const dbEnv = result.summary.sanitizedServicesEnvironment.db;
    assert.equal(backendEnv.DB_PASSWORD, '[REDACTED]');
    assert.equal(backendEnv.JWT_SECRET, '[REDACTED]');
    assert.equal(dbEnv.POSTGRES_PASSWORD, '[REDACTED]');
  }
});

test('R49-2: guard strictly rejects production docker-compose.yml even when projectName is nexus-test', () => {
  for (const preferCli of [true, false]) {
    assert.throws(
      () =>
        verifyDockerTestIsolation({
          composeFilePath: PROD_COMPOSE_PATH,
          projectName: 'nexus-test',
          runId: 'badrun',
          preferCli
        }),
      (err) => {
        assert.equal(err.code, 'DOCKER_TEST_ISOLATION_GUARD_FAILED');
        assert.ok(Array.isArray(err.violations));
        const joined = err.violations.join('\n');
        assert.match(joined, /FORBIDDEN_COMPOSE_FILE/);
        assert.match(joined, /FORBIDDEN_PRODUCTION_CONTAINER/);
        assert.match(joined, /FORBIDDEN_PRODUCTION_NETWORK/);
        assert.match(joined, /FORBIDDEN_PRODUCTION_VOLUME/);
        assert.match(joined, /FORBIDDEN_PRODUCTION_PORT/);
        assert.match(joined, /FORBIDDEN_PRODUCTION_DB_NAME/);
        assert.match(joined, /FORBIDDEN_PRODUCTION_STORAGE_PATH/);
        return true;
      }
    );
  }
});

test('R49-3: guard rejects custom configs that collide with any production volume, port, DB, host bind-mount, or missing labels', () => {
  assert.throws(
    () =>
      verifyDockerTestIsolation({
        composeFilePath: DEFAULT_TEST_COMPOSE_PATH,
        projectName: 'prod-project',
        runId: 'run1',
        resolvedConfigOverride: {
          name: 'prod-project',
          services: {
            backend: {
              container_name: 'nexus-backend',
              labels: {},
              environment: {
                DB_NAME: 'nexus_hrms',
                STORAGE_ROOT: '/app/storage'
              },
              ports: [{ published: '8000', target: 8000 }],
              volumes: [
                { type: 'volume', source: 'nexus-storage-data', target: '/app/storage' },
                { type: 'bind', source: 'C:/repo/Backend/storage', target: '/app/custom' }
              ]
            }
          },
          networks: {
            'nexus-network': { name: 'nexus-network', labels: {} }
          },
          volumes: {
            'nexus-storage-data': { name: 'nexus-storage-data', labels: {} }
          }
        }
      }),
    (err) => {
      assert.equal(err.code, 'DOCKER_TEST_ISOLATION_GUARD_FAILED');
      const joined = err.violations.join('\n');
      assert.match(joined, /INVALID_TEST_PROJECT_NAME/);
      assert.match(joined, /FORBIDDEN_PRODUCTION_CONTAINER/);
      assert.match(joined, /MISSING_ISOLATED_TEST_LABEL/);
      assert.match(joined, /FORBIDDEN_PRODUCTION_DB_NAME/);
      assert.match(joined, /FORBIDDEN_PRODUCTION_STORAGE_PATH/);
      assert.match(joined, /FORBIDDEN_PRODUCTION_PORT/);
      assert.match(joined, /FORBIDDEN_PRODUCTION_VOLUME_MOUNT/);
      assert.match(joined, /FORBIDDEN_HOST_STORAGE_BIND_MOUNT/);
      assert.match(joined, /FORBIDDEN_PRODUCTION_NETWORK/);
      assert.match(joined, /FORBIDDEN_PRODUCTION_VOLUME/);
      return true;
    }
  );

  // Also ensure runGuardedDockerComposeAction blocks before spawning docker on unsafe config
  assert.throws(
    () =>
      runGuardedDockerComposeAction({
        action: 'down',
        composeFilePath: PROD_COMPOSE_PATH,
        projectName: 'nexus-test',
        runId: 'run1'
      }),
    (err) => err.code === 'DOCKER_TEST_ISOLATION_GUARD_FAILED'
  );
});

test('R49-4: redactEnvironmentMap masks all secret/key/password/token fields without leaking values', () => {
  const raw = {
    NODE_ENV: 'production',
    DB_NAME: 'nexus_hrms_docker_test',
    DB_PASSWORD: 'super-secret-db-password',
    POSTGRES_PASSWORD: 'super-secret-pg-password',
    JWT_SECRET: 'jwt-signing-secret',
    GEMINI_API_KEY: 'AIzaSyFakeSecretKeyValue',
    ACCESS_TOKEN: 'bearer-secret-token'
  };
  const redacted = redactEnvironmentMap(raw);
  assert.equal(redacted.NODE_ENV, 'production');
  assert.equal(redacted.DB_NAME, 'nexus_hrms_docker_test');
  assert.equal(redacted.DB_PASSWORD, '[REDACTED]');
  assert.equal(redacted.POSTGRES_PASSWORD, '[REDACTED]');
  assert.equal(redacted.JWT_SECRET, '[REDACTED]');
  assert.equal(redacted.GEMINI_API_KEY, '[REDACTED]');
  assert.equal(redacted.ACCESS_TOKEN, '[REDACTED]');
});
