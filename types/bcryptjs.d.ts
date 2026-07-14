// Temporary local type shim for bcryptjs.
// Remove this file after running: npm install
// (the real types come from @types/bcryptjs in package.json)
declare module 'bcryptjs' {
  export function hash(data: string, saltOrRounds: number | string): Promise<string>
  export function compare(data: string, encrypted: string): Promise<boolean>
  export function hashSync(data: string, saltOrRounds: number | string): string
  export function compareSync(data: string, encrypted: string): boolean
  export default { hash, compare, hashSync, compareSync }
}
