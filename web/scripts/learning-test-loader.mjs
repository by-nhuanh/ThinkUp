// Load the real Angular TypeScript classes for node:test without adding packages.
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); }
  catch (error) {
    if (specifier.startsWith('.')) {
      for (const suffix of ['.ts','.js']) {
        try { return await next(specifier+suffix,context); } catch {}
      }
    }
    throw error;
  }
}
export async function load(url, context, next) {
  if (url.endsWith('/server/src/user/db.js') && process.env.LEARNING_ISOLATED_HTTP_TEST === '1') {
    const source=await readFile(new URL(url),'utf8');
    return {format:'module',shortCircuit:true,source:source.replace(
      'export async function getMongoDb(customUri, customDbName) {',
      'export async function getMongoDb(customUri, customDbName) { if (globalThis.__learningFixtureDb) return globalThis.__learningFixtureDb; throw new Error("Isolated test database is required");'
    )};
  }
  if (url.endsWith('.ts')) {
    const source=await readFile(new URL(url),'utf8');
    return {format:'module',shortCircuit:true,source:ts.transpileModule(source,{compilerOptions:{
      target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,experimentalDecorators:true,useDefineForClassFields:false
    }}).outputText};
  }
  if(url.endsWith('.json'))return {format:'module',shortCircuit:true,source:'export default '+await readFile(new URL(url),'utf8')};
  return next(url,context);
}
