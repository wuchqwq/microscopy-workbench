// The legacy MCP argument validator. Deliberately preserve its error wording
// and division of work with the scientific workers' cross-field validators.
export const SCHEMA_TYPES = Object.freeze(['null','object','array','integer','number','string','boolean'] as const);
export type SchemaType = (typeof SCHEMA_TYPES)[number];
// Registration admits partial clauses in combinators. The existing argument
// validator deliberately retains its original (non-combinator) semantics.
export interface SchemaConstraints {
  // Display metadata is passed through; registration does not type-check it.
  readonly description?: unknown;
  readonly enum?: readonly unknown[];
  readonly properties?: Readonly<Record<string, ArgumentSchema>>;
  readonly required?: readonly string[];
  // Only array-bearing schemas validate/require items. Other schema metadata
  // may carry this key without assigning it array semantics.
  readonly items?: unknown;
  readonly additionalProperties?: boolean;
  readonly minLength?: number; readonly maxLength?: number; readonly pattern?: string;
  readonly minimum?: number; readonly maximum?: number;
  readonly exclusiveMinimum?: number; readonly exclusiveMaximum?: number;
  readonly minItems?: number; readonly maxItems?: number;
  readonly oneOf?: readonly SchemaClause[];
  readonly anyOf?: readonly SchemaClause[];
  readonly allOf?: readonly SchemaClause[];
  readonly not?: SchemaClause;
}
export type SchemaClause = ArgumentSchema | (SchemaConstraints & {readonly type?: undefined});
type ScalarSchemaType = Exclude<SchemaType, 'object' | 'array'>;
interface ScalarSchema extends SchemaConstraints {readonly type: ScalarSchemaType | readonly ScalarSchemaType[];}
interface ArraySchema extends SchemaConstraints {
  readonly type: 'array' | readonly ('array' | ScalarSchemaType)[];
  readonly items: ArgumentSchema;
}
interface ObjectSchema extends SchemaConstraints {
  readonly type: 'object' | readonly ('object' | ScalarSchemaType)[];
  readonly properties: Readonly<Record<string, ArgumentSchema>>;
}
interface MixedContainerSchema extends SchemaConstraints {
  readonly type: readonly SchemaType[];
  readonly properties: Readonly<Record<string, ArgumentSchema>>;
  readonly items: ArgumentSchema;
}
// Container fields are required even when a nullable/multi-type schema is used.
export type ArgumentSchema = ScalarSchema | ArraySchema | ObjectSchema | MixedContainerSchema;
export interface ToolInputSchema extends SchemaConstraints {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, ArgumentSchema>>;
}
export class RpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string) { super(message); this.code = code; }
}
export function tool(name: string, description: string, properties: Readonly<Record<string, ArgumentSchema>>, required: readonly string[] = []) {
  const inputSchema: ToolInputSchema = {type:'object',properties,required,additionalProperties:false};
  return {name, description, inputSchema};
}
// Schema definitions are internal; external values stay unknown until these checks.
export function validate(value: unknown, schema: ArgumentSchema, label = 'arguments'): void {
  const types: readonly SchemaType[] = typeof schema.type === 'string' ? [schema.type] : schema.type;
  const matches = types.some(t => t === 'null' ? value === null : t === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : t === 'array' ? Array.isArray(value)
    : t === 'integer' ? Number.isSafeInteger(value)
    : t === 'number' ? typeof value === 'number' && Number.isFinite(value)
    : typeof value === t);
  if (!matches) throw new RpcError(-32602, `${label}: 类型应为 ${types.join('/')}`);
  if (schema.enum && !schema.enum.includes(value)) throw new RpcError(-32602, `${label}: 不是允许的取值`);
  if (typeof value === 'string' && (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || (schema.pattern && !new RegExp(schema.pattern).test(value)))) {
    throw new RpcError(-32602, `${label}: 字符串长度或格式错误`);
  }
  if (typeof value === 'number' && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) throw new RpcError(-32602, `${label}: 超出允许范围`);
  if (typeof value === 'number' && ((schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) || (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum))) throw new RpcError(-32602, `${label}: 超出允许范围`);
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) throw new RpcError(-32602, `${label}: 元素数量错误`);
    const values: readonly unknown[] = value;
    values.forEach((v,i)=>validate(v,schema.items as ArgumentSchema,`${label}[${i}]`));
  } else if (value !== null && types.includes('object')) {
    for (const key of schema.required || []) if (!Object.hasOwn(value as object,key)) throw new RpcError(-32602,`${label}.${key}: 缺少必填参数`);
    for (const key of Object.keys(value as object)) {
      if (!Object.hasOwn(schema.properties!,key)) throw new RpcError(-32602,`${label}.${key}: 未知参数`);
      validate((value as Record<string, unknown>)[key],schema.properties![key]!,`${label}.${key}`);
    }
  }
}
