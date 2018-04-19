import {GraphQLScalarType, Kind} from "graphql";

const MAX_INT = 2147483647;
const MIN_INT = -2147483648;

function coerceInt(value: any): number {
  if (value === "") {
    throw new TypeError("Int cannot represent non 32-bit signed integer value: (empty string)");
  }
  const num = Number(value);
  if (num !== num || num > MAX_INT || num < MIN_INT) {
    throw new TypeError(`Int cannot represent non 32-bit signed integer value: ${String(value)}`);
  }
  const int = Math.floor(num);
  if (int !== num) {
    throw new TypeError(`Int cannot represent non-integer value: ${String(value)}`);
  }
  return int;
}

/* tslint:disable: variable-name */
export const GraphQLSeqInt = new GraphQLScalarType({
  /* tslint:enable */
  name: "SeqInt",
  serialize: coerceInt,
  parseValue: coerceInt,
  parseLiteral: (ast) => {
    if (ast.kind === Kind.INT) {
      const num = parseInt(ast.value, 10);
      if (num <= MAX_INT && num >= MIN_INT) {
        return num;
      }
    }
    return undefined;
  }
});
