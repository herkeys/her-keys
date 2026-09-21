// A PRIVATE local API stack for the sync journeys: its own scratch database and its own PostgREST container, so a schema change can be
// proven over real HTTP without ever migrating the shared default database that other Her Keys sessions verify against.
//
//   database    f08_stack   built with the harness sequence: auth stub, baseline, Build 4, IR01, F08
//   PostgREST   f08_postgrest, the SAME image and settings as the running local stack, pointed at f08_stack, on a private host port
//   proxy       strips the /rest/v1 prefix supabase-js adds, because a bare PostgREST serves from its root
//
// LOCAL ONLY. It touches nothing but the two things it names, and `stop()` removes them. It reads the running stack's PostgREST
// settings (image, network, environment) and reuses them; it never prints or stores a setting's value.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const DB_CONTAINER = process.env.HERKEYS_LOCAL_DB_CONTAINER ?? 'supabase_db_Her_Keys';
const REST_REFERENCE = process.env.HERKEYS_LOCAL_REST_CONTAINER ?? 'supabase_rest_Her_Keys';
export const PRIVATE_DB = 'f08_stack';
const REST_NAME = 'f08_postgrest';
const REST_PORT = Number(process.env.HERKEYS_PRIVATE_REST_PORT ?? 54391);
const API_PORT = Number(process.env.HERKEYS_PRIVATE_API_PORT ?? 54392);
const ENV = { ...process.env, MSYS_NO_PATHCONV: '1' };

const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', env: ENV, maxBuffer: 128 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const admin = (sql) => docker(['exec', '-i', DB_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atc', sql]);
const applyFile = (db, file) => docker(['exec', '-i', DB_CONTAINER, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], readFileSync(file, 'utf8'));
const applySql = (db, sql) => docker(['exec', '-i', DB_CONTAINER, 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db, '-f', '-'], sql);

const SEQUENCE = [
  join(HERE, 'helpers', '00-auth-stub.sql'),
  join(REPO, 'supabase', 'migrations', '20260919230054_build4_baseline.sql'),
  join(REPO, 'supabase', 'migrations', '20260919231500_build4_cloud_schema.sql'),
  join(REPO, 'supabase', 'migrations', '20260921120000_ir01_duration_source_and_claim_v3.sql'),
  join(REPO, 'supabase', 'migrations', '20260921160000_f08_meal_slot_and_status.sql'),
];

function buildDatabase() {
  admin(`DROP DATABASE IF EXISTS ${PRIVATE_DB} WITH (FORCE);`);
  admin(`CREATE DATABASE ${PRIVATE_DB};`);
  applyFile(PRIVATE_DB, SEQUENCE[0]);
  // The real auth service owns these columns; the journeys insert them. Added here, in the private database only.
  applySql(PRIVATE_DB, 'ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS aud text, ADD COLUMN IF NOT EXISTS role text;');
  for (const file of SEQUENCE.slice(1)) applyFile(PRIVATE_DB, file);
}

function removeRest() {
  try {
    docker(['rm', '-f', REST_NAME]);
  } catch {
    /* not running */
  }
}

function startRest() {
  const reference = JSON.parse(docker(['inspect', REST_REFERENCE]))[0];
  const network = Object.keys(reference.NetworkSettings.Networks)[0];
  const env = Object.fromEntries(reference.Config.Env.map((entry) => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]));
  const uri = new URL(env.PGRST_DB_URI);
  uri.pathname = `/${PRIVATE_DB}`;
  // The reference serves several schemas that only the full stack has; the private database has public.
  const settings = { ...env, PGRST_DB_URI: uri.toString(), PGRST_DB_SCHEMAS: 'public', PGRST_DB_EXTRA_SEARCH_PATH: 'public' };
  removeRest();
  docker([
    'run', '-d', '--rm', '--name', REST_NAME, '--network', network, '-p', `127.0.0.1:${REST_PORT}:3000`,
    ...Object.entries(settings).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    reference.Config.Image,
  ]);
}

async function waitReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${REST_PORT}/`);
      if (response.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`the private PostgREST did not become ready (container ${REST_NAME}); logs: ${docker(['logs', '--tail', '15', REST_NAME]).slice(0, 600)}`);
}

function startProxy() {
  const server = http.createServer((request, response) => {
    const path = request.url.replace(/^\/rest\/v1/, '') || '/';
    const upstream = http.request({ hostname: '127.0.0.1', port: REST_PORT, path, method: request.method, headers: { ...request.headers, host: `127.0.0.1:${REST_PORT}` } }, (reply) => {
      response.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(response);
    });
    upstream.on('error', (error) => {
      response.writeHead(502);
      response.end(String(error.message));
    });
    request.pipe(upstream);
  });
  return new Promise((resolve) => server.listen(API_PORT, '127.0.0.1', () => resolve(server)));
}

export async function startPrivateStack() {
  buildDatabase();
  startRest();
  await waitReady();
  const server = await startProxy();
  let stopped = false;
  return {
    apiUrl: `http://127.0.0.1:${API_PORT}`,
    database: PRIVATE_DB,
    async stop() {
      if (stopped) return;
      stopped = true;
      await new Promise((resolve) => server.close(resolve));
      removeRest();
      admin(`DROP DATABASE IF EXISTS ${PRIVATE_DB} WITH (FORCE);`);
    },
  };
}
