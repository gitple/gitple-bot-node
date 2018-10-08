/*
 * Copyright 2017 Gitple Inc.
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
let mqtt = require('mqtt');
const jsonrpc = require('jsonrpc-lite');
let uuid = require('uuid');
const events = require("events");
process.on('uncaughtException', function (err) {
    console.error('[uncaughtException]', err);
});
class BotManager extends events.EventEmitter {
    constructor(config) {
        super();
        this.botInstances = {}; // bot instances which keeps context and etc
        const self = this;
        const username = config.BOT_GATEWAY_USER ? `${config.BOT_GATEWAY_USER}` : `${config.BOT_ID}`;
        const botSecret = config.BOT_GATEWAY_SECRET;
        const segments = botSecret && botSecret.split('.');
        const payload = segments && segments[1] && new Buffer(segments[1], 'base64').toString();
        const payloadInfo = payload && payload.split(':');
        const SP_ID = config.SP_ID || (payloadInfo && payloadInfo[2]);
        const APP_ID = config.APP_ID || (payloadInfo && payloadInfo[3]);
        this.config = config;
        // connect mqtt
        this.client = mqtt.connect({
            protocol: 'wss',
            hostname: config.BOT_GATEWAY_HOST || 'workspace.gitple.io',
            port: config.BOT_GATEWAY_PORT || 8483,
            clean: true,
            clientId: `chatbot:${username}-${uuid()}`,
            username: `${username}`,
            password: config.BOT_GATEWAY_SECRET,
            connectTimeout: 60 * 1000
        });
        this.client.once('connect', function () {
            self.emit('ready');
        });
        this.client.on('connect', function () {
            // console.log('[MQTT CLIENT] connect');
            self.emit('connect');
        });
        this.client.on('reconnect', function () {
            // console.log('[MQTT CLIENT] reconnect');
            self.emit('reconnect');
        });
        this.client.on('close', function () {
            // console.log('[MQTT CLIENT] close');
            self.emit('disconnect');
        });
        // this.client.on('offline', function () {
        //   // console.log('[MQTT CLIENT] offline');
        //   // self.emit('offline');
        // });
        this.client.on('error', function (err) {
            // console.log('[MQTT CLIENT] error', err && err.toString());
            self.emit('error', err && err.toString());
        });
        // this.client.on('end', function (x) {
        //   // console.log('[MQTT CLIENT] end', x);
        //   self.emit('end');
        // });
        // subscribe topics
        this.client.subscribe([
            `s/${SP_ID}/a/${APP_ID}/t/+/req/#`,
            `s/${SP_ID}/a/${APP_ID}/u/+/r/+/res/#`,
        ]);
        // receive mqtt messages
        this.client.on('message', function (topic, payload) {
            payload = payload.toString(); // from buffer to string
            let splitedTopic = topic.split('/');
            let parsedObj;
            let message;
            if (topic.indexOf(`s/${SP_ID}/a/${APP_ID}/`) !== 0) {
                console.error(`'[SKIP], invalid topic: ${topic}`, payload);
                return;
            }
            // chatbot manager: process request such as start and end
            // BOT_MANAGER_REQ_TOPIC = `s/${SP_ID}/a/${APP_ID}/t/+/req/#`
            if (splitedTopic.length >= 7 &&
                splitedTopic[4] === 't' && splitedTopic[6] === 'req') {
                try {
                    parsedObj = jsonrpc.parse(payload);
                    if (parsedObj.type !== 'request') {
                        console.error('Invalid payload: not a req', topic, payload);
                        return;
                    }
                    message = parsedObj.payload;
                }
                catch (e) {
                    console.error('Invalid payload', topic, payload);
                    return;
                }
                //  let spId = splitedTopic[1];
                //  let appId = splitedTopic[3];
                //  let botId = splitedTopic[5];
                let context = message.params._context;
                let roomId = context.room; // room id in the context
                let sessionId = context.session;
                let msgSubTopic = message.params.msgSub;
                let msgPubTopic = message.params.msgPub;
                let cmdPubTopic = message.params.cmdPub;
                let resPubTopic = message.params.resPub;
                let instanceId = `bot:${roomId}:${sessionId}`; // new chatbot instance per room id
                // console.log(`[JSONRPC REQUEST] gitple --> chatbot : ${topic}`);
                switch (message.method) {
                    case 'start':
                        if (Number(message.params._context.bot) !== config.BOT_ID) {
                            return;
                        }
                        // console.log('Start new chatbot instance', topic, message.params);
                        let botConfig = {
                            id: instanceId,
                            context: message.params._context,
                            topic: {
                                msgSub: msgSubTopic,
                                msgPub: msgPubTopic,
                                cmdPub: cmdPubTopic,
                                resPub: resPubTopic,
                            },
                            user: message.params.user
                        };
                        self.emit('start', botConfig, (err) => {
                            if (resPubTopic) {
                                if (err) {
                                    self.client.publish(resPubTopic, jsonrpc.error(message.id, new jsonrpc.JsonRpcError(err.toString())).toString());
                                }
                                else {
                                    self.client.publish(resPubTopic, jsonrpc.success(message.id, 'OK').toString());
                                }
                            }
                        });
                        return;
                    case 'end':
                        if (Number(message.params._context.bot) !== config.BOT_ID) {
                            return;
                        }
                        // console.log('End a chatbot instance', topic, message.params);
                        let bot = self.botInstances[instanceId];
                        if (bot) {
                            self.emit('end', bot, (err) => {
                                if (resPubTopic) {
                                    if (err) {
                                        self.client.publish(resPubTopic, jsonrpc.error(message.id, new jsonrpc.JsonRpcError(err.toString())).toString());
                                    }
                                    else {
                                        self.client.publish(resPubTopic, jsonrpc.success(message.id, 'OK').toString());
                                    }
                                }
                            });
                        }
                        return;
                    default:
                        console.error('Unknown command', message.method);
                        self.emit('error', 'unknown command', message.method);
                        if (resPubTopic) {
                            self.client.publish(resPubTopic, jsonrpc.error(message.id, jsonrpc.JsonRpcError.methodNotFound()).toString());
                        }
                        return;
                }
                // chatbot instance: process response
                // BOT_INSTANCE_RES_TOPIC = `s/${SP_ID}/a/${APP_ID}/u/+/r/+/res/#`
            }
            else if (splitedTopic.length >= 9 &&
                splitedTopic[4] === 'u' && splitedTopic[6] === 'r' && splitedTopic[8] === 'res') {
                try {
                    parsedObj = jsonrpc.parse(payload);
                    message = parsedObj.payload;
                }
                catch (e) {
                    console.error('Invalid payload', topic, payload);
                    return;
                }
                //console.log(`[JSONRPC RESPONSE] gitple --> chatbot : ${topic}`);
                if (parsedObj.type === 'success') {
                    // console.log('Sucess response', message);
                }
                else {
                    console.error('Error response', message);
                }
                return;
                // chatbot instance: messages from user
                // BOT_INSTANCE_MSG_TOPIC = `s/${SP_ID}/a/${APP_ID}/u/+/r/+/u/+`
            }
            else if (splitedTopic.length >= 9 &&
                splitedTopic[4] === 'u' && splitedTopic[6] === 'r' && splitedTopic[8] === 'u') {
                //console.log(`[MESSAGE] gitple --> chatbot : ${topic}`);
                try {
                    parsedObj = JSON.parse(payload);
                }
                catch (e) { }
                if (parsedObj) {
                    let roomId = splitedTopic[7]; // room id in the topic
                    let sessionId = parsedObj._sid;
                    if (parsedObj.e) {
                        // console.log(' <Event>');
                    }
                    if (parsedObj.m) {
                        //console.log('<Message text, html or component>', parsedObj.m);
                        let instanceId = `bot:${roomId}:${sessionId}`;
                        let bot = self.botInstances[instanceId];
                        if (bot) {
                            bot.emit('message', parsedObj.m);
                        }
                    }
                }
            }
        });
    }
    addBot(bot) {
        if (this.botInstances[bot.id]) {
            console.error('already added', bot.id);
            return;
        }
        this.botInstances[bot.id] = bot;
    }
    removeBot(bot) {
        if (this.botInstances[bot.id]) {
            delete this.botInstances[bot.id];
        }
    }
    validateBot(botConfig, cb) {
        return cb && cb(null, { valid: true });
    }
}
exports.BotManager = BotManager;
class Bot extends events.EventEmitter {
    constructor(botManager, botConfig) {
        super();
        this.id = botConfig.id;
        this.config = botConfig;
        this.client = botManager.client;
        this.botManager = botManager;
        this.client.subscribe(this.config.topic.msgSub); //suscribe to message topic
        this.botManager.addBot(this);
    }
    finalize() {
        this.botManager.removeBot(this);
        this.client.unsubscribe(this.config.topic.msgSub); // unsubscribe message
    }
    sendMessage(mqttMessage, cb) {
        let topic = this.config.topic.msgPub;
        let message = { t: Date.now(), m: mqttMessage, _sid: this.config.context.session };
        if (topic && message) {
            //console.log('gitpleBotSendMessage() message:', topic, message);
            this.client.publish(topic, JSON.stringify(message), function (err) {
                return cb && cb(err);
            });
        }
        else {
            return cb && cb(new Error('no message to send'));
        }
    }
    sendKeyInEvent(cb) {
        let topic = this.config.topic.msgPub;
        let message = { t: Date.now(), e: { keyIn: 's' }, _sid: this.config.context.session };
        if (topic && message) {
            this.client.publish(topic, JSON.stringify(message), function (err) {
                return cb && cb(err);
            });
        }
        else {
            return cb && cb(Error('no message to send'));
        }
    }
    sendCommand(command, cb) {
        let rpcData;
        let context = this.config.context;
        let cmdPubTopic = this.config.topic.cmdPub;
        if (command === 'botEnd') {
            rpcData = jsonrpc.request(`bot-${this.config.id}-${uuid()}`, 'end', {
                _context: context,
                resPub: cmdPubTopic.replace(/\/req($|\/.*)/, '/res'),
            }).toString();
        }
        else if (command === 'transferToAgent') {
            rpcData = jsonrpc.request(`bot-${this.config.id}-${uuid()}`, 'transfer', {
                type: 'agent',
                _context: context,
                resPub: cmdPubTopic.replace(/\/req($|\/.*)/, '/res'),
            }).toString();
        }
        if (rpcData) {
            // console.log(`[JSONRPC REQUEST] chatbot --> gitple : ${cmdPubTopic}`);
            //console.log(rpcData);
            this.client.publish(cmdPubTopic, rpcData, function (err) {
                return cb && cb(err);
            });
        }
    }
}
exports.Bot = Bot;
