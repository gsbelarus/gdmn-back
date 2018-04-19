import {GraphQLScalarType, Kind} from "graphql";

function coerceFloat(value: any): number {
  if (value === "") {
    throw new TypeError("Float cannot represent non numeric value: (empty string)");
  }
  const num = Number(value);
  if (num === num) {
    return num;
  }
  throw new TypeError(`Float cannot represent non numeric value: ${String(value)}`);
}

/* tslint:disable: variable-name */
export const GraphQLNumeric = new GraphQLScalarType({
  /* tslint:enable */
  name: "Numeric",
  serialize: coerceFloat,
  parseValue: coerceFloat,
  parseLiteral: (ast) => {
    return ast.kind === Kind.FLOAT || ast.kind === Kind.INT
      ? parseFloat(ast.value)
      : undefined;
  },
});
