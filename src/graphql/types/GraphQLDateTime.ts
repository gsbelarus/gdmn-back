import {GraphQLError, GraphQLScalarType, Kind} from "graphql";

/* tslint:disable: variable-name */
export const GraphQLDateTime = new GraphQLScalarType({
  /* tslint:enable */
  name: "DateTime",
  /**
   * Serialize date value into string
   * @param  {Date} value date value
   * @return {String} date as string
   */
  serialize: (value) => {
    if (!(value instanceof Date)) {
      throw new TypeError("Field error: value is not an instance of Date");
    }
    if (isNaN(value.getTime())) {
      throw new TypeError("Field error: value is an invalid Date");
    }
    return value.toJSON();
  },
  /**
   * Parse value into date
   * @param  {*} value serialized date value
   * @return {Date} date value
   */
  parseValue: (value) => {
    const date = new Date(value);
    if (isNaN(value.getTime())) {
      throw new TypeError("Field error: value is an invalid Date");
    }
    return date;
  },
  /**
   * Parse ast literal to date
   * @param  {Object} ast graphql ast
   * @return {Date} date value
   */
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError(`Query error: Can only parse strings to dates but got a: ${ast.kind}`, [ast]);
    }
    const result = new Date(ast.value);
    if (isNaN(result.getTime())) {
      throw new GraphQLError("Query error: Invalid date", [ast]);
    }
    if (ast.value !== result.toJSON()) {
      throw new GraphQLError("Query error: Invalid date format, only accepts: YYYY-MM-DDTHH:MM:SS.SSSZ", [ast]);
    }

    return result;
  }
});
