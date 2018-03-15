import { attach, Database, DatabaseCallback, ISOLATION_READ_COMMITED_READ_ONLY,
  Options, Transaction } from 'node-firebird';
import opt from './connection_options';

let db: Database;
let readTransaction: Transaction;

export function connect(alias = '') {
  if (db) {
    throw new Error('db is already connected');
  }

  return new Promise( (resolve, reject) => {
    attach(opt(alias), (err, connectedDB) => {
      if (err) {
        reject(err);
      } else {
        resolve(connectedDB);
      }
    });
  })
  .then( connectedDB => { db = connectedDB as Database; } )
  .then( () => new Promise( resolve => {
    db.transaction(ISOLATION_READ_COMMITED_READ_ONLY, (trOptions, tr) => {
      resolve(tr);
    });
  }))
  .then( tr => { readTransaction = tr as Transaction; } )
  .catch( err => { throw new Error(err); } );
}

export function disconnect() {
  if (!db) {
    throw new Error('db is not connected');
  }

  return new Promise( resolve => {
    if (readTransaction) {
      readTransaction.commit( () => resolve() );
    } else {
      resolve();
    }
  })
  .then( () => {
    return new Promise( resolve => db.detach( () => resolve() ) );
  })
  .catch( err => { throw new Error(err); } );
}

export function getDB() {
  if (!db) {
    throw new Error('db is not connected');
  }
  return db;
}

export function getReadTransaction() {
  if (!db) {
    throw new Error('db is not connected');
  }

  return readTransaction;
}
