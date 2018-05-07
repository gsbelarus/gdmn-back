import {
  FieldDefinitionNode,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLFieldMap,
  GraphQLFieldResolver,
  GraphQLInterfaceType,
  GraphQLIsTypeOfFn,
  GraphQLOutputType,
  ObjectTypeDefinitionNode,
  Thunk
} from "graphql";
import {ObjectTypeExtensionNode} from "graphql/language/ast";

/* tslint:disable */
declare module "graphql" {

  import {Attribute, Entity} from "gdmn-orm";

  export class GraphQLObjectType {
    name: string;
    description: string | void;
    astNode: ObjectTypeDefinitionNode | void;
    extensionASTNodes: ReadonlyArray<ObjectTypeExtensionNode> | void;
    isTypeOf: GraphQLIsTypeOfFn<any, any> | void;

    constructor(config: GraphQLObjectTypeConfig<any, any>);

    getFields(): GraphQLFieldMap<any, any>;

    getInterfaces(): GraphQLInterfaceType[];

    toString(): string;

    toJSON(): string;

    inspect(): string;
  }

  export interface GraphQLObjectTypeConfig<TSource, TContext> {
    name: string;
    interfaces?: Thunk<GraphQLInterfaceType[] | void>;
    fields: Thunk<GraphQLFieldConfigMap<TSource, TContext>>;
    isTypeOf?: GraphQLIsTypeOfFn<TSource, TContext> | void;
    description?: string | void;
    astNode?: ObjectTypeDefinitionNode | void;
    extensionASTNodes?: ReadonlyArray<ObjectTypeExtensionNode> | void;

    entity?: Entity;
  }

  export type GraphQLFieldConfigMap<TSource, TContext> = {
    [key: string]: GraphQLFieldConfig<TSource, TContext>;
  };

  export interface GraphQLFieldConfig<TSource, TContext, TArgs = { [argName: string]: any }> {
    type: GraphQLOutputType;
    args?: GraphQLFieldConfigArgumentMap;
    resolve?: GraphQLFieldResolver<TSource, TContext, TArgs>;
    subscribe?: GraphQLFieldResolver<TSource, TContext, TArgs>;
    deprecationReason?: string | void;
    description?: string | void;
    astNode?: FieldDefinitionNode | void;

    attribute?: Attribute;
  }

}
/* tslint:enable */
