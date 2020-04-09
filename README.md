Gitple bot integration
---------------------------

![Chatbot deploy architecture](/docs/chatbot_arch.png)

## Prerequisite

Step 1) Visit workspace.gitple.io and create account.

Step 2) Download `config.json` file at [Workspace Bots Management](https://workspace.gitple.io/#/pages/bots)

Note that `Pro` pricing plan is required.

`config.json` file to be filled after above steps.

```
{
  "BOT_ID": "_your_bot_id_",
  "BOT_GATEWAY_SECRET": "_your_bot_secret_",
  "APP_CODE": "_your_app_code_"
}
```

## Installation

```
npm install gitple-bot --save
```

## How to Use

This example send 'Hello World' to user on bot `start` command.

```js
let gitple = require('gitple-bot');

let botMgrConfig = require('./config.json'); // bot manager config
let botMgr = new gitple.BotManager(botMgrConfig);
botMgr.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botMgr, botConfig); // start your bot instance
  myBot.sendMessage('Hello World!'); // do your stuff
  myBot.on('message', (message) => {
    myBot.sendMessage('echo message - ' + message);
  });
  return done();
});
botMgr.on('end', (botId, done) => {
  let myBot = botMgr.getBot(botId);
  myBot.finalize(); // finalize your bot instance
  return done();
});
```

This is more complex scenario. User can select a botton for bot command, otherwise user input is echo back.

Note that message format for UI components is here : [message format](#message-format)

```js
botMgr.on('start', (botConfig, cb) => {
  let myBot = new gitple.Bot(botMgr, botConfig);
  let myMessage = {
    t: 'Welcome to my bot!',  // title
    a: [                      // buttons
      { p: 'button', t: 'End talk!', c: '/quit' },
      { p: 'button', t: 'Human please', c: '/transfer' }
    ]
  };

  // After key-in indication for one second, user get welcom message on a bot startup.
  myBot.sendKeyInEvent();
  setTimeout(() => { myBot.sendMessage(myMessage); }, 1 * 1000);

  myBot.on('message', (message) => {
    if (message === '/quit') {
      myBot.sendCommand('botEnd');          // request to end my bot
    } else if (message === '/transfer') {
      myBot.sendCommand('transferToAgent'); // request to transfer to agent
    } else {
      // After key-in indication for one second, user get echo back message.
      myMessage.t = 'echo message - ' + message;
      myBot.sendKeyInEvent();
      setTimeout(() => { myBot.sendMessage(myMessage);  }, 1 * 1000);
    }
  });
  return cb();
});
```

## How to add your bot link to FAQ answer.

You can put the following html code into your FAQ answer after replacing your bot id with `_ID_`:
```
<div>This is My Bot <br><button class="msg-format-btn" data-cmd='{ "t": "assignBot", "p": { "id": _ID_ } }'> My Bot </button></div>
```

## Documentation

Please see the documentation [here](docs/API.md).

## Example

- hello world example [here](example/helloWorld.js).
- the simple example [here](example/simpleBot.js).
- the Dialogflow example [here](https://github.com/gitple/gitple-bot-dialogflow-example).

## Message format

- plain text messages(markdown-aware) or json format

- json object format

```js
{
  t: number; // create time in ms
  e: { // event
    keyIn: 's'|'t'   // "s" - key-in start, "t" - key-in stop
    read: number // message read event with time in ms
  };
  c: any;    // response command to send to the server
  m: string; // message text or html
  m: [       // object type message
    {
      t: string;         // text
      l: {               // link
        u: {url};        // url
        m: {mime type};  // type image/png, text/json ...
        n: string        // filename
      },
      s: { // slider
        n: // object max count in one slide
        p: // preview: page count of slide to display
        a: [
          interaction object
        ]
      },
      a: [ // interaction object
        {
          p: 'text'; // text template
          t: string; // text
          e: string; // echo back text, use as 't' value if 'e' doesn't exist, no echo back if 'e' is null
          c: any; // response command value to send to the server when user selection, use as 'e' value if 'c' doesn't exist
        };
        {
          p: 'image'; // image template
          u: string;  // image url
          t: string;  // title
          e: string;  // echo back text, use as 't' value if 'e' doesn't exist, no echo back if 'e' is null
          c: any; // response command value to send to the server when user selection, use 'e' value if 'c' doesn't exist
          l: { // link on press
            a: string; // url to open at new window, not open if 'l.a' is null
          };
        };
        {
          p: 'button'; // button template
          t: string;   // button text
          e: string; // echo back text, use as 't' value if 'e' doesn't exist, no echo back if 'e' is null
          c: any; // response command value to send to the server when user selection, use as 'e' value if 'c' doesn't exist
          l: { // link on press
            a: string; // url to open at new window
            u: string; // url to call by http get method
          };
        };
        {
          p: 'list'; // selecting list template
          t: string; // title text,
          e: string; // echo back text, use as 't' value if 'e' doesn't exist, no echo back if 'e' is null
          c: any; // response command value to send to the server when user selection, use as 'e' value if 'c' doesn't exist
        };
        {
          p: 'form';   // selecting form template
          f: 'select'; // form type
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
          p: 'form';   // selecting form template
          f: 'input';  // form type
          r: boolean;  // required
          t: string;   // label text
          k: string;   // response key
          v: string;   // [optional] response value
          d: string;   // [optional] default value
        };
        {
          p: 'form';     // selecting form template
          f: 'textarea'; // form type
          r: boolean;    // required
          t: string;     // label text
          k: string;     // response key
          ln: number;    // rows for 'textarea'
          v: string;     // [optional] response value
          d: string;     // [optional] default value
        }
      ]
    }
  ]
}
```

License
----------
   Copyright 2017 Gitple Inc.
