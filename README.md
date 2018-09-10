# gdmn-back

> not production-ready

## Getting Started

### Install

Pre-requirements: Xcode Command Line Tools (macOS), Node.js, npm, git.

#### - macOS

<details>
  <summary>expand me</summary>
  
1. Install [firebird](https://www.firebirdsql.org/en/firebird-3-0/) (version >= 3):
    ```bash
    $ curl -LO https://github.com/FirebirdSQL/firebird/releases/download/R3_0_3/Firebird-3.0.3-32900-x86_64.pkg
    $ open ./Firebird-3.0.3-32900-x86_64.pkg
    ```
    
2. Setup firebird:
    ```bash
    $ firebirdHome='export FIREBIRD_HOME="/Library/Frameworks/Firebird.framework/Resources"'
    $ grep -q -F "$firebirdHome" ~/.bash_profile || echo "$firebirdHome" >> ~/.bash_profile
        
    $ firebirdBin='export PATH=$PATH:$FIREBIRD_HOME/bin'
    $ grep -q -F "$firebirdBin" ~/.bash_profile || echo "$firebirdBin" >> ~/.bash_profile
       
    $ mkdir -p /usr/local/lib 
    $ ln -s /Library/Frameworks/Firebird.framework/Versions/A/Firebird /usr/local/lib/libfbclient.dylib
    
    # troubleshooting: Can not access lock files directory /tmp/firebird/
    $ sudo dseditgroup -o edit -a $(whoami) -t user firebird
 
    # troubleshooting: I/O error during "open O_CREAT" operation. Error while trying to create file. Permission denied
    $ chgrp -R firebird /Library/Frameworks/Firebird.framework
    $ sudo chmod -R g+rwx /Library/Frameworks/Firebird.framework
    ```
   See: [advanced configuration](http://gedemin.blogspot.com/2016/11/firebird-3.html) (optional).

3. Install repository: 
    ```bash
    $ git clone https://github.com/gsbelarus/gdmn-back.git
    $ cd gdmn-back
    $ npm i
    $ npm i
    ```
       
4. Troubleshooting
    >How do i check firebird server is running?
    ```bash
    $ netstat -an | grep 3050 
    ```
    If something is listening on port 3050 then the server is running.
    
    >How do i restart firebird server?
    ```bash
    $ ps -ef | grep xinetd
    $ kill -USR2 <pid>
    ```

</details>

#### - windows

<details>
  <summary>expand me</summary>
  
1. Install build tools:
    ```bash
    $ npm i --global --production windows-build-tools
    $ npm i --global node-gyp
    ```
   
2. Install [firebird](https://www.firebirdsql.org/en/firebird-3-0/) (version >= 3.0):
    ```bash
    $ curl -LO https://github.com/FirebirdSQL/firebird/releases/download/R3_0_3/Firebird-3.0.3.32900_0_x64.exe
    $ cmd /K ./Firebird-3.0.3.32900_0_x64.exe
    ```
    
3. Setup firebird:
    - ```$ copy <fb_dir>/fbclient.dll <win_dir>/SysWOW64``` (System32)
    
        > There's no need if firebird directory(<fb_dir>) in $PATH
        
    - apply [configuration](http://gedemin.blogspot.com/2016/11/firebird-3.html) patch to <fb_dir>/firebird.conf:
        ```diff
        @@ -405,11 +405,11 @@
         #
         # Per-database configurable.
         #
        -#AuthServer = Srp
        +AuthServer = Legacy_Auth
         #
         # Per-connection and per-database configurable.
         #
        -#AuthClient = Srp, Win_Sspi, Legacy_Auth
        +AuthClient = Legacy_Auth
         #
         # If you need to use server plugins that do not provide encryption key (both Legacy_Auth
         # & Win_Sspi) you should also turn off required encryption on the wire with WireCrypt
        @@ -423,7 +423,7 @@
         #
         # Per-database configurable.
         #
        -#UserManager = Srp
        +UserManager = Legacy_UserManager
         
         # TracePlugin is used by firebird trace facility to send trace data to the user
         # or log file in audit case.
        @@ -599,7 +599,7 @@
         #
         # Type: string (predefined values)
         #
        -#WireCrypt = Enabled (for client) / Required (for server)
        +WireCrypt = Disabled
         
         #
         # Should connection over the wire be compressed?
        @@ -610,7 +610,7 @@
         #
         # Type: boolean
         #
        -#WireCompression = false
        +WireCompression = false
        ```    
        
        > Troubleshooting: Create 'localhost:3050/c:\gdmn-back\databases\MAIN.FDB' (node:2308) UnhandledPromiseRejectionWarning: Error: Install incomplete, please read the Compatibility chapter in the release notes for this version

4. Install repository: 
    ```bash
    $ git clone https://github.com/gsbelarus/gdmn-back.git
    $ cd gdmn-back
    $ npm i
    $ npm i
    ```
    
</details>

### Run

1. Verify the configuration is correct (`./config/development.json`).
2. Run command.
    ```bash 
    $ npm start
    ```
3. Wait for initialization and startup

#### old verison of gdmn-front:
1. Clone config file `./db/database.ts.sample` to the same directory and rename it to `./db/database.ts`
2. Fill this config file


## API
<details>
  <summary>expand me</summary>

##### HEADERS:  

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
  "creationDate": "2018-01-01T00:00:00.000Z",
  "size": 123123123
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
    - Request: POST /app/:uid/backup/:backupUid/restore
    ```json
    {
      "alias": "Alias"
    }
    ```
    
3. Delete backup

    - Request: DELETE /app/:uid/backup/:backupUid
    - Response: 200 OK
    
3. Get all backups for application with UID `:uid`

    - Request: GET /app/:uid/backup
    - Response: 200 OK

      ```
      [
        {
            "uid": "91A13180-9BE0-11E8-87E7-7702BC65EB93",
            "alias": "bkpAlias",
            "creationDate": "2018-08-09T14:29:05.897Z",
            "size": 123123123
        },
        {
            "uid": "64CC1290-9BE2-11E8-A2D3-45848C52A2D6",
            "alias": "bkpAlias2",
            "creationDate": "2018-08-09T14:42:09.437Z",
            "size": 123123123
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

</details>


## Related projects

- [`gdmn-front`](https://github.com/gsbelarus/gdmn-front) - web client
