/// <reference types="node" />
import events = require('events');
export interface Store {
    add(key: string, obj: Object, cb?: (err: Error) => void): any;
    remove(key: string, cb?: (err: Error) => void): any;
    list(cb: (err: Error, storedList: string[]) => void): any;
}
export declare class JsonFsStore implements Store {
    add(key: string, obj: any, cb?: (err: Error) => void): void;
    remove(key: string, cb?: (err: Error) => void): void;
    list(cb: (err: Error, storedList: string[]) => void): void;
}
export interface BotManagerConfig {
    SP_ID: number | string;
    APP_ID: number | string;
    BOT_ID: number | string;
    BOT_GATEWAY_USER: string;
    BOT_GATEWAY_SECRET: string;
    BOT_GATEWAY_HOST?: string;
    BOT_GATEWAY_PORT?: number;
    APP_CODE?: string;
}
export interface BotConfig {
    id: string;
    context: {
        room: string;
        session: string;
        bot: string;
    };
    topic: {
        msgSub: string;
        msgPub: string;
        cmdPub: string;
        cmdResPub: string;
        resPub: string;
    };
    user: any;
}
export declare class BotManager extends events.EventEmitter {
    config: BotManagerConfig;
    client: any;
    store: Store;
    botInstances: {
        [key: string]: Bot;
    };
    constructor(config: BotManagerConfig, store?: Store);
    private removeBotState(id);
    private recoverBots(cb?);
    addBot(bot: Bot): void;
    removeBot(bot: Bot): void;
    validateBot(botConfig: BotConfig, cb: (err: Error, result: {
        valid: boolean;
    }) => void): void;
    getBot(bot: string | Bot): Bot;
    getAllBots(): any;
}
export declare class Bot extends events.EventEmitter {
    config: BotConfig;
    client: any;
    botManager: BotManager;
    id: string;
    state: any;
    mtime: number;
    ctime: number;
    constructor(botManager: BotManager, botConfig: BotConfig, state?: any);
    finalize(): void;
    sendMessage(mqttMessage: any, option?: any, cb?: (err: Error) => void): void;
    sendKeyInEvent(cb?: (err?: Error) => void): void;
    sendCommand(command: 'botEnd' | 'transferToAgent', cb?: (err?: Error) => void): void;
    saveState(cb?: any): void;
    deleteState(): void;
}
