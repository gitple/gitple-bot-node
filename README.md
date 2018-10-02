Gitple bot integration
---------------------------

## prerequisite

Step 1) Visit workspace.gitple.io and create account.

Step 2) Get secret access token at [Workspace Settings](https://workspace.gitple.io/#/pages/settings/app)

Note that `Pro` pricing plan is required.

Step 3) Request to add your bot registered to Gitple. Use "Contact Us" menu at [workspace](https://workspace.gitple.io) or use email: support@gitple.com

Note that `Pro` pricing plan is required.

`config.json` file to be filled after above steps.

```
{
  "SP_ID": 1,                              
  "APP_ID": 1,                            
  "BOT_ID": 1,
  "BOT_GATEWAY_USER": "user_name",        
  "BOT_GATEWAY_HOST": "workspace.gitple.io",
  "BOT_GATEWAY_PORT": 8483,
  "BOT_GATEWAY_SECRET": "_your_secret_"
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
  let bot = new gitple.Bot(botMgr, botConfig); // start your bot instance
  bot.sendMessage('Hello World!'); // do your stuff
  return done();
}
botMgr.on('end', (bot, done) => {
  bot.finalize(); // finalize your bot instance
  return done();
}
```

This is more complex scenario. User can select a botton for bot command, otherwise user input is echo back. 

Note that message format for UI components is here : [message format](#message-format)

```js
botMgr.on('start', (botConfig, cb) => {
  let myBot = new gitple.Bot(botMgr, botConfig);
  let myMessage = {
    t: 'Welcome to my bot!',  // title
    a: [                      // buttons
      { p: 'button', t: 'End talk!', c: { e: 'END BOT' } },
      { p: 'button', t: 'Human please', c: { e: 'TRANSFER BOT' } }
    ]
  };

  // After key-in indication for one second, user get welcom message on a bot startup.
  myBot.sendKeyInEvent();
  setTimeout(() => { myBot.sendMessage(myMessage); }, 1 * 1000);

  myBot.on('message', (message) => {
    if (message === 'END BOT') {
      myBot.sendCommand('botEnd');          // request to end my bot
    } else if (message === 'TRANSFER BOT') {
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

## Documentation

Please see the documentation [here](docs/API.md).

## Example

Please see the full example [here](example.js).

## Message format

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
        d: {string}     // title or description
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

License
----------
   Copyright 2017 Gitple Inc.
