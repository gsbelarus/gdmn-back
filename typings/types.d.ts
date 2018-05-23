import {Attribute, Entity} from "gdmn-orm";
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
import Maybe from "graphql/tsutils/Maybe";

/* tslint:disable */
declare module "graphql" {

  import {Attribute, Entity} from "gdmn-orm";

  export class GraphQLObjectType {
    name: string;
    description: Maybe<string>;
    astNode: Maybe<ObjectTypeDefinitionNode>;
    extensionASTNodes: Maybe<ReadonlyArray<ObjectTypeExtensionNode>>;
    isTypeOf: Maybe<GraphQLIsTypeOfFn<any, any>>;

    constructor(config: GraphQLObjectTypeConfig<any, any>);

    getFields(): GraphQLFieldMap<any, any>;

    getInterfaces(): GraphQLInterfaceType[];

    toString(): string;

    toJSON(): string;

    inspect(): string;
  }

  export interface GraphQLObjectTypeConfig<TSource, TContext> {
    name: string;
    interfaces?: Thunk<Maybe<GraphQLInterfaceType[]>>;
    fields: Thunk<GraphQLFieldConfigMap<TSource, TContext>>;
    isTypeOf?: Maybe<GraphQLIsTypeOfFn<TSource, TContext>>;
    description?: Maybe<string>;
    astNode?: Maybe<ObjectTypeDefinitionNode>;
    extensionASTNodes?: Maybe<ReadonlyArray<ObjectTypeExtensionNode>>;

    isSet?: boolean;
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
    deprecationReason?: Maybe<string>;
    description?: Maybe<string>;
    astNode?: Maybe<FieldDefinitionNode>;

    attribute?: Attribute;
  }

}
/* tslint:enable */
