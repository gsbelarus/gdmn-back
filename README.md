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


## STOMP API (over WebSocket)
<details>
  <summary>expand me</summary>

* To work with the auth database you need to simple `CONNECT`
* To work with the user's databases you need to `CONNECT` with header: `app-uid`

##### Create account (auth db is used)
```
>>> CONNECT
login:login
passcode:password
create-user:1

<<< CONNECTED
server:gdmn-back/1.0.0
version:1.2
access-token:token
refresh-token:token

```

##### Login (auth db is used)
```
>>> CONNECT
login:login
passcode:password
create-user:0 (optional)
app-uid:uid (for user's apps)

<<< CONNECTED
server:gdmn-back/1.0.0
version:1.2
access-token:access-token
refresh-token:refresh-token

```
or
```
>>> CONNECT
authorization:access-token
app-uid:uid (for user's apps)

<<< CONNECTED
server:gdmn-back/1.0.0
version:1.2

```
or
```
>>> CONNECT
authorization:refresh-token
app-uid:uid (for user's apps)

<<< CONNECTED
server:gdmn-back/1.0.0
version:1.2
access-token:access-token
refresh-token:refresh-token

```

##### Refresh token (auth base is used)
```
>>> CONNECT
authorization:refresh-token
app-uid:uid (for user's apps)

<<< CONNECTED
server:gdmn-back/1.0.0
version:1.2
access-token:access-token
refresh-token:refresh-token

```
or
```
>>> CONNECT
login:login
passcode:password
create-user:0 (optional)
app-uid:uid (for user's apps)

<<< CONNECTED
server:gdmn-back/1.0.0
version:1.2
access-token:access-token
refresh-token:refresh-token

```

##### Creating tasks
```
>>> SEND
destination:/task
action:...
content-type:application/json;charset=utf-8
content-length:...

{"payload":{...}}
```
* `action`: 
  * `PING` - `payload: {delay: number, steps: number}`
  * `GET_SCHEMA` - `payload: undefined`
  * `QUERY` - `payload: IEntityQueryInspector`

###### Subscription response:
```
<<< MESSAGE
destination:/task
action:...
message-id:msg-0
ack:ack-0
subscription:sub-0
content-type:application/json;charset=utf-8
content-length:...

{"status":1,"progress":{"value":50,"description":"progress"},payload":{...}}
```

* `action`:
  * `PING` - `result: undefined`
  * `GET_SCHEMA` - `result: IERModel`
  * `QUERY` - `result: IQueryResponse`
* `payload` - is request payload
* `status`:
  * 0 - `IDLE`
  * 1 - `RUNNING`
  * 2 - `PAUSED`
  * 3 - `INTERRUPTED`
  * 4 - `ERROR`
  * 5 - `DONE`
* `progress` is sent only when the status is `RUNNING`
* `error` is sent only when the status is `ERROR`
* `result` is sent only when the status is `DONE`

##### Default user
login: `Administrator`  
password: `Administrator`

</details>


## Related projects

- [`gdmn-front`](https://github.com/gsbelarus/gdmn-front) - web client
