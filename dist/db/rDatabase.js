"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class RDatabase {
    constructor() {
        this.fields = [];
        this.relations = [];
    }
}
exports.RDatabase = RDatabase;
class Relation {
    constructor(relationName) {
        this.relationName = relationName;
    }
}
exports.Relation = Relation;
class Field {
    constructor(fieldName) {
        this.fieldName = fieldName;
    }
}
exports.Field = Field;
class RelationField {
    constructor(fieldName) {
        this.fieldName = fieldName;
    }
}
exports.RelationField = RelationField;
//# sourceMappingURL=rDatabase.js.map