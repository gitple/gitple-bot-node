MQTT API
---------------------------

## JSON-RPC command

- Bot manager manages bot instances.
  - creates new bot instance with `start` command.
  - terminates a bot intance with `end` command.
- Bot instance
  - assinged to a room. So, a bot instance can be identified with room id.
  - Room id is in `params._context.room` of JSON RPC object.
  - Room id also inside the topic: `/r/{room_id}/`
  - handles message from user.
  - send message to user in the room. each message should include the saved `params._context` from the `start` command.
- JSON-RPC and MQTT convention
  - JSON-RPC request can have `params.resPub`, the topic where a response to be sent. If it is missing, you can skip sending a reponse.
  - `start` command have `resPub` and additonal topics:
    - `msgSub` : a topic where message to receive. Bot instance will subscribe this on initiation and  unsusbribe on termination.
    - `msgPub` : a topic where message to send.
    - `cmdPub` : a topic where command to send. Bot instance can requst `end` and `transfer` command.

### request: bot manager to subscribe `s/+/a/+/t/+/req/#`

#### start: gitple --> bot manager
 - create new bot instance for each room

| key     | value or subkeys                                            |
|---------|-------------------------------------------------------------|
| jsonrpc | "2.0"                                                       |
| id      | JSON-RPC id                                                 |
| method  | "start"                                                     |
| params  | `_context`: saved at the start command. `room` is room id, `session` is session id. see [context-and-user-format](https://github.com/gitple/chatbot#_context-and-user-format). <br/>`user`:user info. see [context-and-user-format](https://github.com/gitple/chatbot#_context-and-user-format).<br/>`msgSub`: a topic where message to receive. Bot instance will subscribe this on initiation and  unsusbribe on termination.<br/>`msgPub`: a topic where message to send.<br/>`cmdPub`: a topic where command to send. Bot instance can requst `end` and 'transfer' command.<br/>`resPub`: the topic where a response to be sent. |

example

```js
 {
   jsonrpc: "2.0",
   id: "123",
   method: "start",
   params: {
     _context: { ... }, // save for later use;
     user: { ... }, // optional
     msgSub: "s/{sp_id}/a/{app_id}/u/{user_id}/r/{room_id}/u/+",
     msgPub: "s/{sp_id}/a/{app_id}/u/{user_id}/r/{room_id}/t/{bot_id}",
     cmdPub: "s/{sp_id}/a/{app_id}/u/{user_id}/r/{room_id}/req/t/{bot_id}",
     resPub: "s/{sp_id}/a/{app_id}/t/{bot_id}/res"
   }
 }
```

#### end: gitple --> bot manager

| key     | value or subkeys                                            |
|---------|-------------------------------------------------------------|
| jsonrpc | "2.0"                                                       |
| id      | JSON-RPC id                                                 |
| method  | "end"                                                     |
| params  | `_context`: saved at the start command. `room` is room id, `session` is session id. see [context-and-user-format](https://github.com/gitple/chatbot#_context-and-user-format).<br/>`resPub`: the topic where a response to be sent. |


example

```js
 {
   jsonrpc: "2.0",
   id: "123",
   method: "end",
   params: {
     _context: { ... }
     resPub: "s/{sp_id}/a/{app_id}/t/{bot_id}/res"
   }
 }
```

### response: bot manager to publish `resPub` topic

#### success or error : bot manager --> gitple

| key     | value or subkeys                                            |
|---------|-------------------------------------------------------------|
| jsonrpc | "2.0"                                                       |
| id      | JSON-RPC id                                                 |
| result  | JSON-RPC success message                                    |
| error  | JSON-RPC error  message                                |

example

```js
 {
   jsonrpc: "2.0",
   id: "123",
   result: "OK",
 }
```

```js
 {
   jsonrpc: "2.0",
   id: "123",
   "error": {"code": -32600, "m  essage": "Invalid Request"}
 }
```

### request: bot instance to publish `cmdPub` topic

#### end: bot --> gitple
 - this request leads `end` command to this bot instance.

| key     | value or subkeys                                            |
|---------|-------------------------------------------------------------|
| jsonrpc | "2.0"                                                       |
| id      | JSON-RPC id                                                 |
| method  | "end"                                                     |
| params  | `_context`: `room` is room id, `session` is session id. see [context-and-user-format](https://github.com/gitple/chatbot#_context-and-user-format).<br/>`resPub`: the topic where a response to be sent. |


example

```js
 {
   jsonrpc: "2.0",
   id: "123",
   method: "end",
   params: {
     _context: { ... }, // saved at the start command
     resPub: "s/{sp_id}/a/{app_id}/u/{user_id}/r/{room_id}/res"
   }
 }
```
#### transfer: bot --> gitple
 - this request leads `transfer` command to this bot instance.

| key     | value or subkeys                                            |
|---------|-------------------------------------------------------------|
| jsonrpc | "2.0"                                                       |
| id      | JSON-RPC id                                                 |
| method  | "transfer"                                                     |
| params  | `_context`: saved at the start command. `room` is room id, `session` is session id. see [context-and-user-format](https://github.com/gitple/chatbot#_context-and-user-format).<br/>`type`: 'agent'\|'bot'<br/>`resPub`: the topic where a response to be sent. |

example

```js
 {
   jsonrpc: "2.0",
   id: "123",
   method: "transfer",
   params: {
     type: 'agent',     // transfer to agent
     _context: { ... }, // saved at the start command
     resPub: "s/{sp_id}/a/{app_id}/u/{user_id}/r/{room_id}/res"
   }
 }
```

### response: bot instance to subsribe `resPub` topic

- success or error: gitple --> bot

| key     | value or subkeys                                            |
|---------|-------------------------------------------------------------|
| jsonrpc | "2.0"                                                       |
| id      | JSON-RPC id                                                 |
| result  | JSON-RPC success message                                    |
| error  | JSON-RPC error  message                                |

example

```js
 {
   jsonrpc: "2.0",
   id: "123",
   result: "OK",
 }
```

```js
 {
   jsonrpc: "2.0",
   id: "123",
   "error": {"code": -32600, "m  essage": "Invalid Request"}
 }
```

### `_context` and `user` format

- `_context`: given at start command
- `user`: given optionally at start command

```js
     _context: { // Given at start command and saved for later use
       sp: {sp_id},
       app: {app_id},
       user: {user_id},
       room: {room_id},
       session: {session_id},
       bot: {bot_id},
     }
     user: {
       id: 123,
       identifier: "me@example.com", // email for anonymous user
       info: {
         user: {
           email: "me@example.com",
           phone: "01011111234",
           name: "myname",
         },
         system: {
           "browser": {
             "name": "Mobile Safari",
             "version": "11.0",
             "major": "11"
           },
           "device": {
             "vendor": "Apple",
             "model": "iPhone",
             "type": "mobile"
           },
           "os": {
             "name": "iOS",
             "version": "11.4.1"
           },
           "lang": "ko",
           "referrerUrl": "https://gitple.io/",
           "timezone": "+09:00 KST",
           "ip": "1.2.3.4"
         }
       },
       "anonymous": true, // false: login user
     },
```

## chat messges
### bot to subscribe `msgSub`(given at `start` command) topic
 - message: user --> bot

example

```
topic: s/1/a/1/u/7/r/7/u/7
message: {"t":1534424599756,"m":"헬로 123"}
```

### bot to publish `msgPub`(given at `start` command) topic
 - message: bot --> user

Note: `_context`(provided at `start` command) have to be included for all message from bot instance.

example

```
topic: s/1/a/1/u/7/r/7/t/1
message: { m: 'hello, 1 two 3', t: 1534424599225, _context: { sp: 1, app: 1, owner: 7, room: 7, session: 138, bot: '1' } }
```

### messssage format

- plain text messages(markdown-aware) or json format

- json object format

```js
{
  t: number; // create time in ms
  e: string; // event
             //   "keyIn": "s" - key-in start
             //   "read": {number} - message read event with time in ms
  m: string; // message text or html
  m: [       // object type message
    {
      t: text;
      l: {              // link
        d: {string}     // 타이틀 또는 설명
        u: {url};       // url
        m: {mime type}; // type image/png, text/json ...
      };
      s: { // slider
        n: // object max count in one slide
        p: // preview: page count of slide to display
        a: [
          interaction object
        ]
      };
      a: [  // interaction object
        {
          p: "text"; // text template
          t: string;  // text
          c: {
            l: { // link on press
              a: string; // [not implemented] url to open at new window
              u: string; // [not implemented] url to call by http get method
            };
            e: string; // echo back text
            r: string; // [not implemented] response without echo back
          }
        };
        {
          p: "image"; // image template
          u: string;  // image url
          t: string;  // title
          d: string;  // [not implemented] description
          c: {
            l: { // link on press
              a: string; // url to open at new window
              u: string; // [not implemented] url to call by http get method
            };
            e: string; // echo back text
            r: string; // [not implemented] response without echo back
          }
        };
        {
          p: "button"; // button template
          t: string;   // button text
          s: string;   // [not implemented] button style "large or compact". large is full width, compact is text width. default large style
          c: {
            l: { // link on press
              a: string; // [not implemented] url to open at new window
              u: string; // url to call by http get method
            };
            e: string; // echo back text
            r: string; // [not implemented] response without echo back
          }
        };
        {
          p: "list"; // selecting list template
          t: string; // title text,
          s: string; // [not implemented] subtitle
          i: url;    // [not implemented] thumbnail image url
          c: {
            l: { // link on press
              a: string; // [not implemented] url to open at new window
              u: string; // [not implemented] url to call by http get method
            };
            e: string; // echo back text
            r: string; // [not implemented] response without echo back
          }
        };
        {
          p: "form";   // selecting list template
          f: "select"; // form type
          r: boolean;  // required
          t: string;   // label text
          k: string;   // response value
          v: string;   // [optional] value
          d: string;   // [optional] default value
          o: [         // [optional]
            {
              v: string; // value
              t: string; // option text
            }
          ];
        };
        {
          p: "form";   // selecting list template
          f: "input";  // form type
          r: boolean;  // required
          t: string;   // label text
          k: string;   // response key
          v: string;   // [optional] response value
          d: string;   // [optional] default value
        };
        {
          p: "form";     // selecting list template
          f: "textarea"; // form type
          r: boolean;    // required
          t: string;     // label text
          k: string;     // response key
          ln: number;    // rows for "textarea"
          v: string;     // [optional] response value
          d: string;     // [optional] default value
        }
      ]
    }
  ]
}
```

### message examples

```
//bot start command from gitple
{"jsonrpc":"2.0","id":"chatbot-28768308-e46a-490d-8772-cb6d4f54731c","method":"start","params":{"_context":{"sp":1,"app":1,"room":7,"session":104,"bot":"1"},"user":{"id":7,"identifier":"aaaa","role":"endUser","info":{}},"resPub":"s/1/a/1/t/1/res","msgSub":"s/1/a/1/u/7/r/7/u/+","msgPub":"s/1/a/1/u/7/r/7/t/1","cmdPub":"s/1/a/1/u/7/r/7/req/t/1"}}


//slide list with images
{"t":1534395332549,"m":{"t":"샌드위치의 종류를 선택해 주세요","a":[],"s":{"n":2,"p":2,"a":[{"p":"image","u":"https://s3.ap-northeast-2.amazonaws.com/www.gitple.io/bot/sandwitch/1.jpg","t":"오늘의 샌드위치","c":{"e":"오늘의 샌드위치"}},{"p":"text","t":"오늘의 샌드위치","c":{"e":"오늘의 샌드위치"}},{"p":"image","u":"https://s3.ap-northeast-2.amazonaws.com/www.gitple.io/bot/sandwitch/2.jpg","t":"닭가슴살 & 고구마","c":{"e":"닭가슴살 & 고구마"}},{"p":"text","t":"닭가슴살 & 고구마","c":{"e":"닭가슴살 & 고구마"}},{"p":"image","u":"https://s3.ap-northeast-2.amazonaws.com/www.gitple.io/bot/sandwitch/3.jpg","t":"선식","c":{"e":"선식"}},{"p":"text","t":"선식","c":{"e":"선식"}}]}},"_context":{"sp":1,"app":1,"room":7,"session":104,"bot":"1"}}

//slide list
{"t":1534395335435,"m":{"t":"소스를 선택해 주세요","a":[],"s":{"n":4,"p":2,"a":[{"p":"list","t":"발사믹"},{"p":"list","t":"오리엔탈"},{"p":"list","t":"머스타드"},{"p":"list","t":"사우전"},{"p":"list","t":"요거트"}]}},"_context":{"sp":1,"app":1,"room":7,"session":104,"bot":"1"}}

//read event from user
{"t":1534395332562,"e":{"read":1534395332549}}
{"t":1534395335361,"m":"오늘의 샌드위치","c":null}

//slide list
{"t":1534395335435,"m":{"t":"소스를 선택해 주세요","a":[],"s":{"n":4,"p":2,"a":[{"p":"list","t":"발사믹"},{"p":"list","t":"오리엔탈"},{"p":"list","t":"머스타드"},{"p":"list","t":"사우전"},{"p":"list","t":"요거트"}]}},"_context":{"sp":1,"app":1,"room":7,"session":104,"bot":"1"}}

//read event from user
{"t":1534395335512,"e":{"read":1534395335435}}

//key in start from user
{"t":1534395306493,"e":{"keyIn":"s"}}

//bot end command from bot
{"jsonrpc":"2.0","id":"chatbot-1865b69a-39f3-43a6-aa38-c46b4de9940d","method":"end","params":{"_context":{"sp":1,"app":1,"room":7,"session":104,"bot":"1"},"user":null,"resPub":"s/1/a/1/t/1/res"}}
```

License
----------
   Copyright 2017 Gitple Inc.
