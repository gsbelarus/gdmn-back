export class RDatabase {
  private fields: Field[] = [];
  private relations: Relation[] = [];
}

export class Relation {
  constructor(public readonly relationName: string) {}
}

export class Field {
  constructor(public readonly fieldName: string) {}
}

export class RelationField {
  constructor(public readonly fieldName: string) {}
}
