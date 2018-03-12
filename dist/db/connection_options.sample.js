"use strict";
// make a copy of this file with name connection_options.ts
// fill in connection options for your server/database
Object.defineProperty(exports, "__esModule", { value: true });
const databases = [
    {
        alias: 'test',
        options: {
            host: '127.0.0.1',
            port: 3050,
            database: 'test.fdb',
            user: 'SYSDBA',
            password: 'masterkey',
            lowercase_keys: false,
            role: undefined,
            pageSize: 4096 // for db creation
        }
    }
];
exports.default = (alias = '') => {
    const found = databases.find((opt) => !alias || opt.alias === alias);
    if (!found) {
        throw new Error('Unknown db alias');
    }
    return found.options;
};
//# sourceMappingURL=connection_options.sample.js.map