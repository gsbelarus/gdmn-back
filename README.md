# gdmn-back (DEV)

## Install

### Windows
1. Install [Firebird](https://www.firebirdsql.org/en/firebird-3-0/) version greater than or equal to 3.0.
2. Add `fbclient.dll` directory to the PATH.
3. Run next commands

    ```bash
    $ npm install --global --production windows-build-tools
    $ npm install --global node-gyp
    $ npm install
    ```

### Mac OS X
1. Install [Firebird](https://www.firebirdsql.org/en/firebird-3-0/), [see also](https://www.firebirdsql.org/file/documentation/papers_presentations/html/paper-fb-macosx-install.html)
2. Install Xcode Command Line Tools
3. Run next commands
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
`Authorization: Bearer jwtToken` - for authorization  
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
  "token": "JWTToken"
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
  "token": "JWTToken"
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
  "uid": "Application-UID"
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
  "uid": "Application-UID"
}]
```

##### Application endpoints
Request: `GET` - `/app/:uid/er`  
Request: `POST` - `/app/:uid/data`  

##### Default user
login: `Administrator`  
password: `Administrator`
