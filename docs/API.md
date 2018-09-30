## Table of Contents

  - [Class: BotManager](#botmanager)
    - [new BotManager(config)](#new-botmanagerconfig)
    - [botManager.addBot(bot)](#botmanageraddbotbot)
    - [botManager.removeBot(bot)](#botmanagerremovebotbot)
    - [botManager.on(command[, callback])](#botmanageroncommand-callback)
  - [Class: Bot](#bot)
    - [new Bot(botManager, config)](#new-botbotmanager-config)
    - [bot.finalize()](#botfinalize)
    - [bot.sendMessage(message[, callback])](#botsendmessage-callback)
    - [bot.sendCommand(command[, callback])](#botsendcommand-callback)
    - [bot.sendKeyInEvent([callback])](#botsendkeyineventcallback)
    - [bot.on(command, callback)](#botoncommand-callback)

### BotManager
Exposed by `require('gitple-bot')`.

#### new BotManager(config)

  - `config` _(Object)_  the bot manger configuration
    - `SP_ID` _(String|Number)_  service id
    - `APP_ID` _(String|Number)_  app id
    - `BOT_ID` _(String|Number)_  the registered bot id
    - `BOT_GATEWAY_USER` _(String)_ user name
    - `BOT_GATEWAY_HOST` _(String)_ gateway host name ex. "workspace.gitple.io",
    - `BOT_GATEWAY_PORT` _(Number)_ gateway port (`8483`),
    - `BOT_GATEWAY_SECRET`: _(String)_ bot secret

```js
const gitple = require('gitple-bot');

const botManager = new gitple.BotManager(require('config.json'));
```

#### botManager.addBot(bot)
  - `bot` _(Object)_ instance of `Bot`

Bot manager keep tracking the given bot instance. You don't need to call it explicitly since it is called from Bot constructor.


#### botManager.removeBot(bot)
  - `bot` _(Object)_ instance of `Bot`

Bot manager stop tracking the given bot instance. You don't need to call it explicitly since it is called from bot.finalize().


#### botManager.on(command[, callback])

  - `command` _(String)_ 'start' or 'end' command
  - `callback` _(Function)_
    - 'start' command parameters
      - `botConfig` _(Object)_ a bot configuration to start
      - `done` _(Function)_ You should call it after handling this event. It sends back response to the bot gateway. On error, error reason in string is given.
    - 'end' command parameters
      - `bot` _(Object)_ an instance of Bot to end
      - `done` _(Function)_ You should call it after handling this event. It sends back response to the bot gateway. On error, error reason in string is given.


```js
botManager.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botMgr, botConfig);
  myBot.sendMessage('Hello World!')
  return done(); // on success, otherwise: return done('error reason');
});
botManager.on('end', (bot, done) => {
  bot.finalize();
  return done();
});
```

### Bot
Exposed by `require('gitple-bot')`.

#### new Bot(botManager, config)

  - `botManager` _(Object)_  the instance of BotManager
  - `config` _(Object)_  the bot configuration given by bot manager's 'start' event.
    - `id` _(String)_  the unique identifier fot this bot config
    - `context` _(Object)_  the context of this bot is bound. see below down example.
    - `user` _(Object)_  the user info of this bot is assigned. see below down example.
    - `topic` _(String)_ the topics of this bot is bound.

Note: must be called on a bot being initiated.

```js
botManager.on('start', (botConfig, done) => {
  let myBot = new gitple.Bot(botMgr, botConfig);
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
  let myBot = new gitple.Bot(botMgr, botConfig);
  myBot.sendMessage('Hello World');
```

#### bot.sendCommand(command[, callback])
  - `message` _(String)_  possible command are either 'botEnd' or 'transferToAgent'.
  - `callback` _(Function)_ called after this async job is done.

```js
  let myBot = new gitple.Bot(botMgr, botConfig);
  myBot.sendCommand('botEnd');
```

#### bot.sendKeyInEvent([callback]])
  - `callback` _(Function)_ called after this async job is done.

Key in event is sent to the assigned user. Depending on chat client, the key-in animation is shown to the user for a while.

```js
  let myBot = new gitple.Bot(botMgr, botConfig);
  myBot.sendKeyInEvent();
```

License
----------
   Copyright 2017 Gitple Inc.
