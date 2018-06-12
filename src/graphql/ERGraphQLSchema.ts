import {
  Attributes,
  Entity,
  EntityAttribute,
  EnumAttribute,
  ERModel,
  isBooleanAttribute,
  isDateAttribute,
  isDetailAttribute,
  isEntityAttribute,
  isEnumAttribute,
  isFloatAttribute,
  isIntegerAttribute,
  isNumericAttribute,
  isScalarAttribute,
  isSequenceAttribute,
  isSetAttribute,
  isStringAttribute,
  isTimeAttribute,
  isTimeStampAttribute,
  ScalarAttribute,
  SetAttribute
} from "gdmn-orm";
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLEnumValueConfigMap,
  GraphQLFieldConfigMap,
  GraphQLFieldResolver,
  GraphQLFloat,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType
} from "graphql";
import {GraphQLFieldConfigArgumentMap, GraphQLInputFieldConfigMap} from "graphql/type/definition";
import {User} from "../context/User";
import {GraphQLDate} from "./types/GraphQLDate";
import {GraphQLDateTime} from "./types/GraphQLDateTime";
import GraphQLJSON from "./types/GraphQLJSON";
import {GraphQLNumeric} from "./types/GraphQLNumeric";
import {GraphQLSeqInt} from "./types/GraphQLSeqInt";
import {GraphQLTime} from "./types/GraphQLTime";

export interface IERGraphQLResolver {
  queryResolver: GraphQLFieldResolver<any, User, IArgs>;
}

interface IContext {
  locale: TLocale;
  erModel: ERModel;
  resolver: IERGraphQLResolver;
  types: GraphQLObjectType[];
  inputTypes: GraphQLInputObjectType[];
  nullableFieldsEnumTypes: GraphQLEnumType[];
  aliasesFields: { [entityName: string]: GraphQLInputFieldConfigMap };
}

export type TLocale = "ru" | "en" | "by";

export interface IArgs {
  [argName: string]: any;
}

export class ERGraphQLSchema extends GraphQLSchema {

  private _context: IContext;

  constructor(erModel: ERModel, locale: TLocale, resolver: IERGraphQLResolver) {
    const context: IContext = {
      locale,
      erModel,
      resolver,
      types: [],
      inputTypes: [],
      nullableFieldsEnumTypes: [],
      aliasesFields: {}
    };

    super({
      query: new GraphQLObjectType({
        name: "Query", // FIXME possible conflicts
        fields: () => ({
          entityModel: {
            type: GraphQLJSON,
            args: {name: {type: GraphQLString}},
            resolve: (source, args) => context.erModel.entity(args.name).serialize()
          },
          entityModels: {
            type: GraphQLJSON,
            resolve: () => context.erModel.serialize()
          },
          entityData: {
            type: new GraphQLObjectType({
              name: "EntityQuery", // FIXME possible conflicts
              fields: ERGraphQLSchema._createQueryTypeFields(context)
            }),
            resolve: (source) => ({entityData: source})
          }
        })
      })
    });

    this._context = context;
  }

  private static _escapeName(context: IContext, name: string): string {  // TODO tmp
    return name
      .replace(/\$/g, "_dollar_")
      .replace(/\./g, "_dot_");
  }

  private static _createQueryTypeFields(context: IContext): GraphQLFieldConfigMap<any, any> {
    return Object.entries(context.erModel.entities)
      .filter(([entityName, entity]) => !entity.isAbstract)
      .reduce((fields, [entityName, entity]) => {
        const lName = entity.lName[context.locale];

        fields[ERGraphQLSchema._escapeName(context, entityName)] = {
          type: new GraphQLList(ERGraphQLSchema._createEntityType(context, entity)),
          args: ERGraphQLSchema._createQueryArgs(context, entity),
          description: lName && lName.name,
          resolve: context.resolver.queryResolver.bind(context.resolver)
        };
        return fields;
      }, {} as GraphQLFieldConfigMap<any, any>);
  }

  private static _createEntityType(context: IContext, entity: Entity): GraphQLObjectType {
    const duplicate = context.types.find((item) => item.name === ERGraphQLSchema._escapeName(context, entity.name));
    if (duplicate) {
      return duplicate;
    }

    const lName = entity.lName[context.locale];

    const type = new GraphQLObjectType({
      name: ERGraphQLSchema._escapeName(context, entity.name),
      description: lName && lName.name,
      fields: () => ERGraphQLSchema._createEntityAttributes(context, entity),
      entity
    });
    context.types.push(type);

    return type;
  }

  private static _createEntityAttributes(context: IContext, entity: Entity): GraphQLFieldConfigMap<any, any> {
    const fields = ERGraphQLSchema._createScalarAttributes(context, entity, entity.attributes);
    const linkFields = ERGraphQLSchema._createLinkAttributes(context, entity, entity.attributes);

    return {
      ...fields,
      ...linkFields
    };
  }

  private static _createScalarAttributes(context: IContext,
                                         entity: Entity,
                                         attributes: Attributes): GraphQLFieldConfigMap<any, any> {
    return Object.entries(attributes).reduce((fields, [attributeName, attribute]) => {

      if (isScalarAttribute(attribute)) {
        const keyType = ERGraphQLSchema._createScalarType(context, entity, attribute);
        const lName = attribute.lName[context.locale];

        fields[ERGraphQLSchema._escapeName(context, attributeName)] = {
          type: attribute.required ? new GraphQLNonNull(keyType) : keyType,
          description: lName && lName.name,
          attribute
        };
      }

      return fields;
    }, {} as GraphQLFieldConfigMap<any, any>);
  }

  private static _createLinkAttributes(context: IContext,
                                       entity: Entity,
                                       attributes: Attributes): GraphQLFieldConfigMap<any, any> {
    return Object.entries(attributes).reduce((fields, [attributeName, attribute]) => {

      if (isEntityAttribute(attribute)) {
        let type = ERGraphQLSchema._createLinkType(context, entity, attribute);
        if (type) {
          const lName = attribute.lName[context.locale];

          if (isDetailAttribute(attribute)) {
            type = new GraphQLNonNull(new GraphQLList(type));
          }
          fields[ERGraphQLSchema._escapeName(context, attributeName)] = {
            type,
            description: lName && lName.name,
            attribute
          };
        }
      }

      return fields;
    }, {} as GraphQLFieldConfigMap<any, any>);
  }

  private static _createScalarType(context: IContext,
                                   entity: Entity,
                                   attribute: ScalarAttribute): GraphQLScalarType | GraphQLEnumType {
    // TODO BLOBAttribute
    // TODO TimeIntervalAttribute
    if (isEnumAttribute(attribute)) {
      return ERGraphQLSchema._createEnumType(context, entity, attribute);
    } else if (isDateAttribute(attribute)) {
      return GraphQLDate;
    } else if (isTimeAttribute(attribute)) {
      return GraphQLTime;
    } else if (isTimeStampAttribute(attribute)) {
      return GraphQLDateTime;
    } else if (isSequenceAttribute(attribute)) {
      return GraphQLSeqInt;
    } else if (isIntegerAttribute(attribute)) {
      return GraphQLInt;
    } else if (isNumericAttribute(attribute)) {
      return GraphQLNumeric;
    } else if (isFloatAttribute(attribute)) {
      return GraphQLFloat;
    } else if (isBooleanAttribute(attribute)) {
      return GraphQLBoolean;
    } else if (isStringAttribute(attribute)) {
      return GraphQLString;
    } else {
      return GraphQLString;
    }
  }

  private static _createEnumType(context: IContext, entity: Entity, attribute: EnumAttribute): GraphQLEnumType {
    const lName = attribute.lName && attribute.lName[context.locale];

    return new GraphQLEnumType({
      name: ERGraphQLSchema._escapeName(context, `${entity.name}_${attribute.name}`),
      description: lName && lName.name,
      values: attribute.values.reduce((values, value, index) => {
        const valueLName = value.lName && value.lName[context.locale];
        values[`VALUE_${index + 1}`] = {
          value: value.value,
          description: valueLName && valueLName.name
        };
        return values;
      }, {} as GraphQLEnumValueConfigMap)
    });
  }

  private static _createLinkType(
    context: IContext,
    entity: Entity,
    attribute: EntityAttribute
  ): GraphQLUnionType | GraphQLObjectType | GraphQLList<any> | null {
    const entityTypes = attribute.entity.map((item) => ERGraphQLSchema._createEntityType(context, item));

    if (entityTypes.length > 1) {
      const unionType = new GraphQLUnionType({
        name: ERGraphQLSchema._escapeName(context, `${entity.name}_UNION_${attribute.name}`),
        types: entityTypes,
        resolveType: (source, ctx, info) => { // FIXME
          const selection = info.fieldNodes[0].selectionSet!.selections[0];
          if (selection.kind === "InlineFragment"
            && selection.typeCondition
            && selection.typeCondition.kind === "NamedType") {
            return selection.typeCondition.name.value;
          }
          return "";
        }
      });
      if (isSetAttribute(attribute)) {
        return ERGraphQLSchema._wrapSetAttributeType(context, entity, attribute, unionType);
      }
      return unionType;
    }

    if (entityTypes.length === 1) {
      if (isSetAttribute(attribute)) {
        return ERGraphQLSchema._wrapSetAttributeType(context, entity, attribute, entityTypes[0]);
      }
      return entityTypes[0];
    }
    return null;
  }

  private static _wrapSetAttributeType(context: IContext,
                                       entity: Entity,
                                       attribute: SetAttribute,
                                       entityType: GraphQLUnionType | GraphQLObjectType): GraphQLList<any> {
    const lName = attribute.lName[context.locale];

    return new GraphQLList(new GraphQLObjectType({
      name: ERGraphQLSchema._escapeName(context, `${entity.name}_SET_${attribute.name}`),
      fields: {
        ...this._createScalarAttributes(context, entity, attribute.attributes),
        [ERGraphQLSchema._escapeName(context, attribute.name)]: { // TODO possible conflict names ???
          type: entityType,
          description: lName && lName.name,
          attribute
        }
      },
      isSet: true,
      entity
    }));
  }

  private static _createQueryArgs(context: IContext, entity: Entity): GraphQLFieldConfigArgumentMap {
    const args: GraphQLFieldConfigArgumentMap = {};

    const where = ERGraphQLSchema._createWhereInputType(context, entity);
    if (where) {
      args.where = {type: where};
    }

    return args;
  }

  private static _createWhereInputType(context: IContext, entity: Entity): GraphQLInputObjectType | undefined {
    const entityName = ERGraphQLSchema._escapeName(context, entity.name);

    const whereType = new GraphQLInputObjectType({
      name: `${entityName}_Where`,
      fields: () => {
        const whereFields: GraphQLInputFieldConfigMap = {};

        const isNullType = ERGraphQLSchema._createIsNullType(context, entity);
        if (Object.keys(isNullType).length) {
          whereFields.isNull = {type: isNullType};
        }

        return whereFields;
      }
    });

    if (Object.keys(whereType.getFields()).length) {
      return whereType;
    }
  }

  private static _createIsNullType(context: IContext, entity: Entity): GraphQLInputObjectType {
    const entityName = ERGraphQLSchema._escapeName(context, entity.name);

    const duplicate = context.inputTypes.find((item) => item.name === `${entityName}_IsNull`);
    if (duplicate) {
      return duplicate;
    }

    const lName = entity.lName[context.locale];
    const type = new GraphQLInputObjectType({
      name: `${entityName}_IsNull`,
      description: lName && lName.name,
      fields: () => {
        const fields: GraphQLInputFieldConfigMap = {_dummyField: {type: GraphQLBoolean}};

        const isNullType = ERGraphQLSchema._createIsNullEnumType(context, entity);
        if (isNullType) {
          fields.attribute = {type: isNullType};
        }

        fields.nested = {
          type: new GraphQLInputObjectType({
            name: `${entityName}_IsNull_Nested`,
            fields: () => Object.values(entity.attributes).reduce((nestedFields, attribute) => {
              if (isEntityAttribute(attribute)) {
                if (attribute.entity.length) {
                  const attributeName = ERGraphQLSchema._escapeName(context, attribute.name);
                  let nestedType: GraphQLInputObjectType | undefined;
                  if (attribute.entity.length > 1) {
                    nestedType = new GraphQLInputObjectType({
                      name: `${entityName}_${attributeName}_IsNull_Union`,
                      fields: attribute.entity.reduce((unionFields, nestedEntity) => {
                        const unionEntityName = ERGraphQLSchema._escapeName(context, nestedEntity.name);
                        unionFields[unionEntityName] = {
                          type: ERGraphQLSchema._createIsNullType(context, nestedEntity)
                        };
                        return unionFields;
                      }, {} as GraphQLInputFieldConfigMap)
                    });
                  } else if (attribute.entity.length === 1) {
                    nestedType = ERGraphQLSchema._createIsNullType(context, attribute.entity[0]);
                  }
                  if (nestedType) {
                    nestedFields[`${attributeName}`] = {type: nestedType};
                  }
                }
              }
              return nestedFields;
            }, {_dummyField: {type: GraphQLBoolean}} as GraphQLInputFieldConfigMap)
          })
        };
        return fields;
      }
    });
    context.inputTypes.push(type);

    return type;
  }

  private static _createIsNullEnumType(context: IContext, entity: Entity): GraphQLEnumType | undefined {
    const entityName = ERGraphQLSchema._escapeName(context, entity.name);

    const nullValues = Object.values(entity.attributes)
      .filter((attribute) => !attribute.required)
      .reduce((values, attribute) => {
        const lName = attribute.lName && attribute.lName[context.locale];
        values[ERGraphQLSchema._escapeName(context, attribute.name)] = {
          value: attribute.name,
          description: lName && lName.name
        };
        return values;
      }, {} as GraphQLEnumValueConfigMap);

    if (Object.keys(nullValues).length) {
      return new GraphQLEnumType({
        name: `${entityName}_IsNull_Attr`,
        values: nullValues
      });
    }
  }
}
