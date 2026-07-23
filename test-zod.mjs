import { z } from "zod/v3";

console.log("z:", typeof z);
console.log("z.object:", typeof z.object);
const schema = z.object({});
console.log("schema:", schema);
console.log("schema._def:", schema._def);
console.log("schema.parse:", typeof schema.parse);
console.log("schema.safeParse:", typeof schema.safeParse);
console.log("isZodTypeLike:", 'parse' in schema && typeof schema.parse === 'function' && 'safeParse' in schema && typeof schema.safeParse === 'function');
console.log("isZodSchemaInstance:", '_def' in schema || '_zod' in schema || ('parse' in schema && typeof schema.parse === 'function' && 'safeParse' in schema && typeof schema.safeParse === 'function'));