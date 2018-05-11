declare module "nesthydrationjs" {

  export interface IDefinitionField {
    column: string;
    type?: string;
    default?: any;
  }

  export interface IDefinition {
    [fieldName: string]: string | IDefinitionField | Definitions;
  }

  export type Definitions = IDefinition | IDefinition[];

  export namespace Nesthydrationjs {

    /** Creates a data structure containing nested objects and/or arrays from
     * tabular data based on a structure definition provided by
     * structPropToColumnMap. If structPropToColumnMap is not provided but
     * the data has column names that follow a particular convention then a
     * nested structures can also be created.
     */
    function nest(data: any, structPropToColumnMap?: Definitions): any;

    /** Registers a custom type handler */
    function registerType(name: string, handler: (cellValue: any, name: string, row: any) => any): void;
  }

  export default function nestHydrationJS(): Nesthydrationjs;
}
