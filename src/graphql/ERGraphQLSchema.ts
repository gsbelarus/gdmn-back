import {
  Attributes,
  BooleanAttribute,
  DateAttribute,
  Entity,
  EntityAttribute,
  EnumAttribute,
  ERModel,
  FloatAttribute,
  IntegerAttribute,
  NumericAttribute,
  ScalarAttribute,
  SequenceAttribute,
  SetAttribute,
  StringAttribute,
  TimeAttribute,
  TimeStampAttribute
} from "gdmn-orm";
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType
} from "graphql";
import {GraphQLEnumValueConfigMap} from "graphql/type/definition";
import {GraphQLDate} from "./types/GraphQLDate";
import {GraphQLDateTime} from "./types/GraphQLDateTime";
import {GraphQLNumeric} from "./types/GraphQLNumeric";
import {GraphQLSeqInt} from "./types/GraphQLSeqInt";
import {GraphQLTime} from "./types/GraphQLTime";

export interface IContext {
  locale: TLocale;
  erModel: ERModel;
  types: GraphQLObjectType[];
}

export type TLocale = "ru" | "en" | "by";

export class ERGraphQLSchema extends GraphQLSchema {

  private _context: IContext;

  constructor(erModel: ERModel, locale: TLocale) {
    const context: IContext = {
      locale,
      erModel,
      types: []
    };

    super({
      query: new GraphQLObjectType({
        name: "Objects",
        fields: () => ERGraphQLSchema._createQueryTypeFields(context)
      })
    });

    this._context = context;
  }

  private static _escapeName(context: IContext, name: string): string {  // TODO tmp
    return name.replace(/\$/g, "__");
  }

  private static _createQueryTypeFields(context: IContext): GraphQLFieldConfigMap<any, any> {
    return Object.entries(context.erModel.entities)
      .filter(([entityName, entity]) => !entity.isAbstract)
      .reduce((fields, [entityName, entity]) => {
        const entityType = ERGraphQLSchema._createEntityType(context, entity);

        if (entityType) {
          const lName = entity.lName[context.locale];

          fields[ERGraphQLSchema._escapeName(context, entityName)] = {
            type: entityType,
            description: lName && lName.name
          };
        }
        return fields;
      }, {} as GraphQLFieldConfigMap<any, any>);
  }

  private static _createEntityType(context: IContext, entity: Entity): GraphQLObjectType | null {
    if (!Object.keys(entity.attributes).length) {
      return null;
    }

    const duplicate = context.types.find((item) => item.name === ERGraphQLSchema._escapeName(context, entity.name));
    if (duplicate) {
      return duplicate;
    }

    const lName = entity.lName[context.locale];

    const type = new GraphQLObjectType({
      name: ERGraphQLSchema._escapeName(context, entity.name),
      description: lName && lName.name,
      fields: () => ERGraphQLSchema._createEntityAttributes(context, entity)
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

      if (attribute instanceof ScalarAttribute) {
        const keyType = ERGraphQLSchema._createScalarType(context, attribute);
        const lName = attribute.lName[context.locale];

        fields[ERGraphQLSchema._escapeName(context, attributeName)] = {
          type: attribute.required ? new GraphQLNonNull(keyType) : keyType,
          description: lName && lName.name
        };
      }

      return fields;
    }, {} as GraphQLFieldConfigMap<any, any>);
  }

  private static _createLinkAttributes(context: IContext,
                                       entity: Entity,
                                       attributes: Attributes): GraphQLFieldConfigMap<any, any> {
    return Object.entries(attributes).reduce((fields, [attributeName, attribute]) => {

      if (attribute instanceof EntityAttribute) {
        const type = ERGraphQLSchema._createLinkType(context, entity, attribute);
        if (type) {
          const lName = attribute.lName[context.locale];

          fields[ERGraphQLSchema._escapeName(context, attributeName)] = {
            type,
            description: lName && lName.name
          };
        }
      }

      return fields;
    }, {} as GraphQLFieldConfigMap<any, any>);
  }

  private static _createScalarType(context: IContext, attribute: ScalarAttribute): GraphQLScalarType | GraphQLEnumType {
    switch (attribute.constructor) {
      // case TimeIntervalAttribute:  // TODO TimeIntervalAttribute
      //   break;
      case EnumAttribute:
        const enumAttribute = attribute as EnumAttribute;
        return new GraphQLEnumType({
          name: ERGraphQLSchema._escapeName(context, enumAttribute.name),
          values: enumAttribute.values.reduce((values, enumAttr, index) => {
            const valueLName = enumAttr.lName && enumAttr.lName[context.locale];
            values[`VALUE_${index + 1}`] = {
              value: enumAttr.value,
              description: valueLName && valueLName.name
            };
            return values;
          }, {} as GraphQLEnumValueConfigMap)
        });
      case DateAttribute:
        return GraphQLDate;
      case TimeAttribute:
        return GraphQLTime;
      case TimeStampAttribute:
        return GraphQLDateTime;
      case SequenceAttribute:
        return GraphQLSeqInt;
      case IntegerAttribute:
        return GraphQLInt;
      case NumericAttribute:
        return GraphQLNumeric;
      case FloatAttribute:
        return GraphQLFloat;
      case BooleanAttribute:
        return GraphQLBoolean;
      case StringAttribute:
      default:
        return GraphQLString;
    }
  }

  private static _createLinkType(
    context: IContext,
    entity: Entity,
    attribute: EntityAttribute
  ): GraphQLUnionType | GraphQLObjectType | GraphQLList<any> | null {
    const entityTypes = attribute.entity.reduce((types, item) => {
      const entityType = ERGraphQLSchema._createEntityType(context, item);
      if (entityType) {
        types.push(entityType);
      }
      return types;
    }, [] as GraphQLObjectType[]);

    if (entityTypes.length > 1) {
      const unionType = new GraphQLUnionType({
        name: ERGraphQLSchema._escapeName(context, `${entity.name}_UNION_${attribute.name}`),
        types: entityTypes
      });
      if (attribute instanceof SetAttribute) {
        return ERGraphQLSchema._wrapSetAttributeType(context, entity, attribute, unionType);
      }
      return unionType;
    }

    if (entityTypes.length === 1) {
      if (attribute instanceof SetAttribute) {
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
      fields: () => {
        return {
          ...this._createScalarAttributes(context, entity, attribute.attributes),
          [ERGraphQLSchema._escapeName(context, attribute.name)]: { // TODO possible conflict names ???
            type: entityType,
            description: lName && lName.name
          }
        };
      }
    }));
  }
}
