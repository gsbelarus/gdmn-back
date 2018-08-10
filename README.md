# gdmn-back (DEV)

## Install

### Windows
1. Install Git.
2. Install [Firebird](https://www.firebirdsql.org/en/firebird-3-0/) version greater than or equal to 3.0.
3. Add `fbclient.dll` directory to the PATH.
4. Run next commands

    ```bash
    $ npm install --global --production windows-build-tools
    $ npm install --global node-gyp
    $ npm install
    ```

### Mac OS X
1. Install Git.
2. Install [Firebird](https://www.firebirdsql.org/en/firebird-3-0/), [see also](https://www.firebirdsql.org/file/documentation/papers_presentations/html/paper-fb-macosx-install.html)
3. Install Xcode Command Line Tools
4. Run next commands
    ```bash 
    $ ln -s /Library/Frameworks/Firebird.framework/Versions/A/Firebird /usr/local/lib/libfbclient.dylib
    $ npm install
    ```

### Linux
...

## Usage

### Startup
1. Verify the configuration is correct (`./config/development.json`).
2. Run command.
    ```bash 
    $ npm start
    ```
3. Wait for initialization and startup

##### For old verison of gdmn-front:
1. Clone config file `./db/database.ts.sample` to the same directory and rename it to `./db/database.ts`
2. Fill this config file

### Endpoints

HEADERS:  
`Authorization: Bearer accessJWTToken/refreshJWTToken` - for authorization or refresh token
`Accept: text/plan` - for errors in the response as text  
`Accept: text/html` - for errors in the response as html  
`Accept: application/json` - for errors in the response as json  

##### Create account
Request: `POST` - `/account`  
```json
{
  "login": "Login",
  "password": "Password"
}
```
Response:
```json
{
  "access_token": "JWTToken",
  "refresh_token": "JWTToken",
  "token_type": "type"
}
```

##### Login
Request: `POST` - `/account/login`
```json
{
  "login": "Login",
  "password": "Password"
}
```
Response:
```json
{
  "access_token": "JWTToken",
  "refresh_token": "JWTToken",
  "token_type": "type"
}
```

##### Refresh token
Request: `POST` - `/account/refresh`
Response:
```json
{
  "access_token": "JWTToken",
  "refresh_token": "JWTToken",
  "token_type": "type"
}
```

##### Create application
Request: `POST` - `/app`   
```json
{
  "alias": "Alias"
}
```
Response:
```json
{
  "alias": "Alias",
  "uid": "Application-UID",
  "creationDate": "2018-01-01T00:00:00.000Z"
}
```

##### Delete application
Request: `DELETE` - `/app/:uid`  
Response:
```json
{
  "uid": "Application-UID"
}
```

##### Get applications
Request: `GET` - `/app`  
Response:
```json
[{
  "alias": "Alias",
  "uid": "Application-UID",
  "creationDate": "2018-01-01T00:00:00.000Z"
}]
```

##### Application endpoints
Request: `GET` - `/app/:uid/er`  
Request: `POST` - `/app/:uid/data`  

##### Default user
login: `Administrator`  
password: `Administrator`


#### Backup/Restore

For backup and restore you need connect to server's socket (on client) and subscribe on events (backupFinished, restoreFinished):
```
<script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.0.3/socket.io.js"></script>>
<script>
  var socket = io('http://localhost:4000', {
    query: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNTMzODI0NDY1LCJleHAiOjE1MzM4MzUyNjV9.wb8Fh4OCZksz4GoG7HJIWGsNqxFVuA7sKqkNoviHcSk'
    }
  });

  socket.on('backupFinished', function (data) {
    console.log('on backup finish');
  });

  socket.on('restoreFinished', function (data) {
    console.log('on restore finish');
  })
</script>
```

1. Make backup

    - Request:  POST /app/:uid/backup
    - Response: 200 OK

2. Make restore
    - Request: POST /app/:uid/:backupUid/restore
    
3. Get all backups for application with UID `:uid`

    - Request: GET /app/:uid/backup
    - Response: 200 OK

      ```
      [
        {
            "uid": "91A13180-9BE0-11E8-87E7-7702BC65EB93",
            "alias": "bkpAlias",
            "creationDate": "2018-08-09T14:29:05.897Z"
        },
        {
            "uid": "64CC1290-9BE2-11E8-A2D3-45848C52A2D6",
            "alias": "bkpAlias2",
            "creationDate": "2018-08-09T14:42:09.437Z"
        }
      ]
      ```

4. Download one backup file
    - Request: GET /app/:uid/backup/:backupUid/download
    - Response: File downloading...

5. Upload one backup file
    - Request: 
      ```
      curl \
      -X POST -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNTMzODI0NDY1LCJleHAiOjE1MzM4MzUyNjV9.wb8Fh4OCZksz4GoG7HJIWGsNqxFVuA7sKqkNoviHcSk" \ 
      -F 'bkpFile=/Users/antonshwab/source/gdmn/gdmn-back/databases/backup/64CC1290-9BE2-11E8-A2D3-45848C52A2D6.fbk' \
      -F 'alias=bkpALIAS' localhost:4000/app/C95519D0-9BDF-11E8-A31C-99F0847D6DDA/backup/upload

      // how such request looks like in koa ctx:
      { request:
        { method: 'POST',
          url: '/app/C95519D0-9BDF-11E8-A31C-99F0847D6DDA/backup/upload',
          header:
            { host: 'localhost:4000',
              'user-agent': 'curl/7.54.0',
              accept: '*/*',
              authorization:
              'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNTMzODI0NDY1LCJleHAiOjE1MzM4MzUyNjV9.wb8Fh4OCZksz4GoG7HJIWGsNqxFVuA7sKqkNoviHcSk',
              'content-length': '341',
              expect: '100-continue',
              'content-type': 'multipart/form-data; boundary=------------------------8374df0255da9cd9' 
            } 
          }
      }
      ```
    - Response: 200 OK


