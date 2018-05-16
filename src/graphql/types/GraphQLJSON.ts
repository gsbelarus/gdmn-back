import {GraphQLScalarType} from "graphql";
import {Kind} from "graphql/language";
import {ValueNode} from "graphql/language/ast";
import Maybe from "graphql/tsutils/Maybe";

function identity(value: any): any {
  return value;
}

function parseLiteral(ast: ValueNode, variables: Maybe<{ [key: string]: any }>): any {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT: {
      const value = Object.create(null);
      ast.fields.forEach((field) => {
        value[field.name.value] = parseLiteral(field.value, variables);
      });

      return value;
    }
    case Kind.LIST:
      return ast.values.map((n) => parseLiteral(n, variables));
    case Kind.NULL:
      return null;
    case Kind.VARIABLE: {
      const name = ast.name.value;
      return variables ? variables[name] : undefined;
    }
    default:
      return undefined;
  }
}

export default new GraphQLScalarType({
  name: "JSON",
  description:
  "The `JSON` scalar type represents JSON values as specified by " +
  "[ECMA-404](http://www.ecma-international.org/" +
  "publications/files/ECMA-ST/ECMA-404.pdf).",
  serialize: identity,
  parseValue: identity,
  parseLiteral,
});