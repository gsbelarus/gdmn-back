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
