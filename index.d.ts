/// <reference types="node" />
import events = require('events');
export interface BotManagerConfig {
    SP_ID: number | string;
    APP_ID: number | string;
    BOT_ID: number | string;
    BOT_GATEWAY_USER: string;
    BOT_GATEWAY_HOST: string;
    BOT_GATEWAY_PORT: number;
    BOT_GATEWAY_SECRET: string;
}
export interface BotConfig {
    id: string;
    context: {
        room: string;
        session: string;
    };
    topic: {
        msgSub: string;
        msgPub: string;
        cmdPub: string;
        resPub: string;
    };
    user: any;
}
export declare class BotManager extends events.EventEmitter {
    config: BotManagerConfig;
    client: any;
    botInstances: {
        [key: string]: Bot;
    };
    constructor(config: BotManagerConfig);
    addBot(bot: Bot): void;
    removeBot(bot: Bot): void;
}
export declare class Bot extends events.EventEmitter {
    config: BotConfig;
    client: any;
    botManager: BotManager;
    id: string;
    constructor(botManager: BotManager, botConfig: BotConfig);
    finalize(): void;
    sendMessage(mqttMessage: any, cb?: (err: Error) => void): void;
    sendKeyInEvent(cb?: (err?: Error) => void): void;
    sendCommand(command: 'botEnd' | 'transferToAgent', cb?: (err?: Error) => void): void;
}