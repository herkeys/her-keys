// Disposable embedded PostgreSQL. No hosted project, network, or customer data.
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {FULL_CHAIN,migrationPath} from './migration-chain.mjs';
import assert from 'node:assert/strict';
export async function deletionDatabase() {
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,created_at timestamptz DEFAULT now());
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,created_at timestamptz DEFAULT now());
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 `);
 await db.exec(`GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
 CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text);`);
 for(const file of FULL_CHAIN) {
  try {await db.exec(await readFile(migrationPath(file),'utf8'));}
  catch(error) {console.error('migration failed:',file,error.message);await db.close();throw error;}
 }
 return db;
}
if(process.argv[1]?.endsWith('deletion-database.mjs')) {
 const db=await deletionDatabase();
 console.log('Full migration chain applied to disposable PostgreSQL.');
 await db.close();
}
