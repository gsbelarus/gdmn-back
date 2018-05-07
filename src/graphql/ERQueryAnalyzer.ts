import {Attribute, Entity} from "gdmn-orm";
import {
  FieldNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  GraphQLNullableType,
  GraphQLObjectType,
  GraphQLObjectTypeConfig,
  GraphQLResolveInfo,
  GraphQLType,
  InlineFragmentNode,
  isListType,
  isObjectType,
  isWrappingType,
  SelectionNode
} from "graphql";
import {getArgumentValues} from "graphql/execution/values";
import {IArgs} from "./ERGraphQLSchema";

interface IContext {
  fragments: IFragments;
  variableValues: IArgs;
}

interface IFragments {
  [fragmentName: string]: FragmentDefinitionNode;
}

interface ISkipRelayConnectionResult {
  parentType: GraphQLType;
  fieldNode: FieldNode;
}

export interface IQueryField {
  attribute: Attribute;
  selectionValue: string;
  query?: IQuery;
}

export interface IQuery {
  args: IArgs;
  entity: Entity;
  fields: IQueryField[];
}

export default class ERQueryAnalyzer {

  public static resolveInfo(info: GraphQLResolveInfo): IQuery[] {
    const parentType = info.parentType;
    const context: IContext = {
      fragments: info.fragments,
      variableValues: info.variableValues
    };

    if (info.fieldNodes.length) {
      return info.fieldNodes.reduce((queries, fieldNode) => {
        const query = ERQueryAnalyzer.analyze(fieldNode, parentType, context);
        if (query) {
          queries.push(query);
        }
        return queries;
      }, [] as IQuery[]);
    }
    return [];
  }

  private static skipWrappingTypes(type: GraphQLType): GraphQLType | GraphQLNullableType {
    if (isWrappingType(type)) {
      return ERQueryAnalyzer.skipWrappingTypes(type.ofType);
    }
    return type;
  }

  private static skipRelayConnection(parentType: GraphQLType | GraphQLNullableType,
                                     fieldNode: FieldNode,
                                     context: IContext): ISkipRelayConnectionResult {
    if (isObjectType(parentType)) {
      const edgesField = parentType.getFields().edges;
      if (edgesField) {
        const edgesType = edgesField.type;
        if (isListType(edgesType) && isObjectType(edgesType.ofType)) {
          const nodeType = edgesType.ofType.getFields().node.type;

          if (fieldNode.selectionSet) {
            const edges = ERQueryAnalyzer
              .spreadFragments(fieldNode.selectionSet.selections, context.fragments, parentType.name)
              .find((selection) => selection.name.value === "edges");

            if (edges && edges.selectionSet) {
              const node = ERQueryAnalyzer
                .spreadFragments(edges.selectionSet.selections, context.fragments, parentType.name)
                .find((selection) => selection.name.value === "node");

              if (node) {
                return {
                  parentType: nodeType,
                  fieldNode: node
                };
              }
            }
          }
        }
      }
    }
    return {parentType, fieldNode};
  }

  private static spreadFragments(selections: ReadonlyArray<SelectionNode>,
                                 fragments: IFragments,
                                 typeName: string): FieldNode[] {
    const deepSelections: any[] = selections.map((selection) => {
      switch (selection.kind) {
        case "FragmentSpread":
          const fragmentSpread = selection as FragmentSpreadNode;
          const fragmentName = fragmentSpread.name.value;
          const fragment = fragments[fragmentName];
          return ERQueryAnalyzer.spreadFragments(fragment.selectionSet.selections, fragments, typeName);
        case "InlineFragment":
          const inlineFragment = selection as InlineFragmentNode;
          if (inlineFragment.typeCondition && inlineFragment.typeCondition.name.value === typeName) {
            return ERQueryAnalyzer.spreadFragments(selection.selectionSet.selections, fragments, typeName);
          }
          return [];

        default:
          return selection;
      }
    });
    return [].concat(...deepSelections);
  }

  private static analyze(fieldNode: FieldNode,
                         parentType: GraphQLType,
                         context: IContext): IQuery | undefined {
    parentType = ERQueryAnalyzer.skipWrappingTypes(parentType);

    let args: IArgs = {};

    if (parentType instanceof GraphQLObjectType) {
      const field = parentType.getFields()[fieldNode.name.value];
      args = getArgumentValues(field, fieldNode, context.variableValues);

      const fieldType = ERQueryAnalyzer.skipWrappingTypes(field.type);
      const skippedRelay = ERQueryAnalyzer.skipRelayConnection(fieldType, fieldNode, context);

      parentType = skippedRelay.parentType;
      fieldNode = skippedRelay.fieldNode;
    }

    const config: GraphQLObjectTypeConfig<any, any> = (parentType as any)._typeConfig;
    if (config && config.entity) {
      const entity: Entity = config.entity;
      const query: IQuery = {
        args,
        entity,
        fields: []
      };

      if (fieldNode.selectionSet) {
        query.fields = fieldNode.selectionSet.selections.reduce((fields, selection) => {
          if (selection.kind === "Field" && isObjectType(parentType)) {
            const field = parentType.getFields()[selection.name.value];
            const attribute: Attribute = (field as any).attribute;
            if (attribute) {
              fields.push({
                attribute,
                selectionValue: selection.name.value,
                query: ERQueryAnalyzer.analyze(selection, parentType, context)
              });
            }
          }
          return fields;
        }, [] as IQueryField[]);
      }
      return query;
    }
  }
}
