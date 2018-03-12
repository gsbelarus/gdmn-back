// make a copy of this file with name connection_options.ts
// fill in connection options for your server/database

import { Options } from 'node-firebird';

interface IDBAlias {
  alias: string;
  options: Options;
}

const databases: IDBAlias[] = [
  {
    alias: 'test',
    options:
      {
        host: '127.0.0.1',
        port: 3050,
        database: 'test.fdb',
        user: 'SYSDBA',
        password: 'masterkey',
        lowercase_keys: false,
        role: undefined,
        pageSize: 4096  // for db creation
      }
  }
];

export default (alias = '') => {
  const found = databases.find( (opt) => !alias || opt.alias === alias );
  if (!found) {
    throw new Error('Unknown db alias');
  }
  return found.options;
};
