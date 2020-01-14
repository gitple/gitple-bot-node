## Table of Contents

  - [Class: BotManager](#botmanager)
    - [new BotManager(config)](#new-botmanagerconfig)
    - [botManager.addBot(bot)](#botmanageraddbotbot)
    - [botManager.removeBot(bot)](#botmanagerremovebotbot)
    - [botManager.validateBot(botConfig[, callback])](#botmanagerremovebotbotconfig-callback)
    - [botManager.getBot(bot)](#botmanagergetbotbot)
    - [botManager.getAllBots()](#botmanagergetallbotsbot)
    - [botManager.on(command[, callback])](#botmanageroncommand-callback)
  - [Class: Bot](#bot)
    - [new Bot(botManager, config[, state])](#new-botbotmanager-config-state)
    - [bot.finalize()](#botfinalize)
    - [bot.sendMessage(message[, callback])](#botsendmessagemessage-option-callback)
    - [bot.sendCommand(command[, options, callback])](#botsendcommandcommand-callback)
    - [bot.sendKeyInEvent([callback])](#botsendkeyineventcallback)
    - [bot.saveState()](#botsavestate)
    - [bot.deleteState()](#botdeletestate)
    - [bot.on(event, callback)](#botonevent-callback)

### BotManager
Exposed by `require(`gitple-bot`)`.

#### new BotManager(config, store)

  - `config` _(Object)_  the bot manger configuration
    - `BOT_ID` _(Number)_  the registered bot id
    - `BOT_GATEWAY_SECRET`: _(String)_ bot secret,
    - `APP_CODE`: _(String)_ app code,
  - `store` _(Object)_ store object to save a bot state data
    - add(key: string, obj: Object, cb?: (err: Error) => void);
    - remove(key: string, cb?: (err: Error) => void);
    - list(cb: (err: Error, storedList: string[]) => void);


```js
const gitple = require(`gitple-bot`);

const botManager = new gitple.BotManager(require(`config.json`));
```

#### botManager.addBot(bot)
  - `bot` _(Object)_ instance of `Bot`

Bot manager keep tracking the given bot instance. You don`t need to call it explicitly since it is called from Bot constructor.


#### botManager.removeBot(bot)
  - `bot` _(Object)_ instance of `Bot`

Bot manager stop tracking the given bot instance. You don`t need to call it explicitly since it is called from bot.finalize().

#### botManager.validateBot(botConfig[, callback])
  - `botConfig` _(Object)_ the bot configuration verified.

Validate the given bot configuration.

#### botManager.getBot(bot)
  - `bot` _(String)_|_(Object)_ bot id or instance of `Bot`

Get the bot instance which is already initiated and managed. Otherwise, null.

#### botManager.getAllBots()
Get the all the list of bot instances which is already initiated and managed.

#### botManager.on(event[, callback])

  - `event` _(String)_ one of the events listed below at the description of callback function.
  - `callback` _(Function)_
    - `start` event parameters
      - `botConfig` _(Object)_ a bot configuration to start
      - `done` _(Function)_ You should call it after handling this event. It sends back response to the bot gateway. On error, error reason in string is given.
    - `end` event parameters
      - `botId` _(Object)_ an id of Bot to end
      - `done` _(Function)_ You should call it after handling this event. It sends back response to the bot gateway. On error, error reason in string is given.
    - `ready` event parameters - it is called when Bot manager is ready
    - `recovery` event parameters - it is called after Bot manager is ready if bot is saved
      - recoveryObject _(Object)_ a saved bot info
        - `config` _(Object)_ a saved bot configuration
        - `state` _(Object)_ a saved bot state data
        - `savedTime` _(Object)_ time to save a bot
    - `timeout` event parameters - it is called after establishing connection to Gitple service.
      - `botId` _(Object)_ an id of Bot which is timeout
    - `connect` event parameters - it is called after establishing connection to Gitple service.
      - none
    - `reconnect` event parameters - it is called after re-establishing connection to Gitple service.
      - none
    - `disconnect` event parameters - it is called after disconnected from Gitple service.
      - none
    - `error` event parameters - it is called on connection error to Gitple service.
      - `err` `Error` error reason

```js
botManager.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botManager, botConfig);
  myBot.sendMessage('Hello World!');
  return done(); // on success, otherwise: return done(`error reason`);
});
botManager.on('end', (botId, done) => {
  let myBot = botManager.getBot(botId);
  myBot.finalize();
  return done();
});
```

### Bot
Exposed by `require('gitple-bot')`.

#### new Bot(botManager, config[, state])

  - `botManager` _(Object)_  the instance of BotManager
  - `config` _(Object)_  the bot configuration given by bot manager`s `start` event.
    - `id` _(String)_  the unique identifier fot this bot config
    - `context` _(Object)_  the context of this bot is bound. see below down example.
    - `user` _(Object)_  the user info of this bot is assigned. see below down example.
    - `topic` _(String)_ the topics of this bot is bound.
  - `state` _(Object)_  the bot state data used in a bot


Note: must be called on a bot being initiated.

```js
botManager.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botManager, botConfig);
}
```

example of bot context and user info:

```js
     _context: { // Given at start command and saved for later use
       sp: {sp_id},
       app: {app_id},
       user: {user_id},
       room: {room_id},
       session: {session_id},
       bot: {registered bot_id},
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

#### bot.finalize()

Note: must be called when a bot is no longer existed.

```js
botManager.on('end', (bot, done) => {
  bot.finalize();
});
```

#### bot.sendMessage(message[, callback])
  - `message` _(Object|String)_ message to be sent to the assigned user. It can be string or json object. For more details, see [message format](/README.md#messssage-format).
  - `callback` _(Function)_ called after this async job is done.


```js
  let myBot = new gitple.Bot(botManager, botConfig);
  myBot.sendMessage(`Hello World`);
```

#### bot.sendCommand(command[, options, callback])
  - `command` _(String)_ possible command are either `botEnd`, `transferToAgent` or `transferToBot`.
  - `options` _(Object)_ options for 'transferToBot' command
  - `callback` _(Function)_ called after this async job is done.

```js
  let myBot = new gitple.Bot(botManager, botConfig);
  myBot.sendCommand(`botEnd`);
  myBot.sendCommand(`transferToAgent`);
  myBot.sendCommand(`transferToBot`, { id: });
```

#### bot.sendKeyInEvent([callback]])
  - `callback` _(Function)_ called after this async job is done.

Key in event is sent to the assigned user. Depending on chat client, the key-in animation is shown to the user for a while.

```js
  let myBot = new gitple.Bot(botManager, botConfig);
  myBot.sendKeyInEvent();
```

#### bot.saveState()
  - save the current bot state for later recovery.

#### bot.deleteState()
  - dlete the saved bot state since it is no longer used.

#### bot.on(event, callback)
  - `event` _(String)_ `message` on user input, `event` on (key-in, ...) event
  - `callback` _(Function)_ called after this async job is done.

```js
  let myBot = new gitple.Bot(botManager, botConfig);
  myBot.on('message', (message, option) => { // option.isUserInput: boolean - true if message input by user key-in.
    myBot.sendMessage(myMessage); // echo back
  });
  myBot.on('event', (event) => {

  });
```

License
----------
   Copyright 2017 Gitple Inc.
