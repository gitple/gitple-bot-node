/*
 * Copyright 2017 Gitple Inc.
 */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
let _ = require('lodash');
const CLUSTER_SYNC_CYCLE = 15 * 1000; // 15sec
const CLUSTER_SYNC_TTL = CLUSTER_SYNC_CYCLE + 2000; // 17sec
const CLUSTER_ELECTION_CYCLE = 60 * 1000; // 1min
class Cluster {
    constructor(nodeId, bootTime, getJobCount, send) {
        this.myNode = {
            id: nodeId,
            bootTime: bootTime,
            isLeader: null
        };
        this.sync = {
            nodeInfo: null,
            sendTimer: null,
            electionTimer: null
        };
        this.callback = {
            send: send,
            getJobCount: getJobCount
        };
        this.reset();
        setInterval(() => {
            if (this.myNode.isLeader) {
                this.sendLeaderElection(this.myNode.id);
            }
        }, CLUSTER_ELECTION_CYCLE);
    }
    reset() {
        this.myNode.isLeader = null;
        this.sync.nodeInfo = {};
        this.election = {
            leaderId: null,
            workerIds: []
        };
    }
    syncGetLeader() {
        this.syncRemoveExpired();
        return _.find(this.sync.nodeInfo, { type: 'leader' });
    }
    syncGetWorkers() {
        this.syncRemoveExpired();
        return _.filter(this.sync.nodeInfo, { type: 'worker' });
    }
    syncAddInfo(nodeInfo) {
        this.syncRemoveExpired();
        if (nodeInfo.type === 'leader') {
            this.syncResetLeader();
        }
        this.sync.nodeInfo[nodeInfo.id] = {
            id: nodeInfo.id,
            type: nodeInfo.type,
            bootTime: nodeInfo.bootTime,
            expireTime: nodeInfo.expireTime,
            jobCount: nodeInfo.jobCount
        };
    }
    syncResetLeader() {
        const leaderInfo = this.syncGetLeader();
        if (leaderInfo) {
            delete this.sync.nodeInfo[leaderInfo.id];
        }
    }
    syncRemoveExpired() {
        const now = Date.now();
        _.forEach(this.sync.nodeInfo, (nodeInfo, nodeId) => {
            if (nodeInfo.expireTime < now) {
                // remove expired node
                delete this.sync.nodeInfo[nodeId];
            }
        });
    }
    syncRemoveInfo(nodeId) {
        delete this.sync.nodeInfo[nodeId];
    }
    syncElectionLeader() {
        if (this.sync.electionTimer) {
            return;
        }
        this.sync.electionTimer = setTimeout(() => {
            this.sync.electionTimer = null;
            const preLeaderId = this.election.leaderId;
            const preWorkerIds = this.election.workerIds;
            const clusterLeader = this.syncGetLeader();
            const clusterWorks = this.syncGetWorkers();
            this.election.leaderId = clusterLeader ? clusterLeader.id : null;
            this.election.workerIds = _.map(clusterWorks, 'id');
            if (this.myNode.id === this.election.leaderId) {
                this.myNode.isLeader = true;
            }
            else {
                this.myNode.isLeader = false;
            }
            if (!_.isNil(this.election.leaderId) && preLeaderId !== this.election.leaderId) {
                this.sendLeaderElection(this.election.leaderId);
                if (this.myNode.isLeader) {
                    this.sendSyncReq();
                }
            }
            if (preLeaderId !== this.election.leaderId
                || _.size(_.difference(preWorkerIds, this.election.workerIds)) > 0
                || _.size(_.difference(this.election.workerIds, preWorkerIds)) > 0) {
                const noLeader = _.isNil(this.election.leaderId) || !clusterLeader;
                console.log(`\n━━━━━━━━━ <Cluster Info: ${new Date().toISOString()}> ━━━━━━━━━`);
                console.log(`◆ [LeaderNode:${noLeader ? 0 : 1}]`);
                if (noLeader) {
                    console.log(`     └─────────── [Error] No Leader`);
                    this.sendSyncReq();
                }
                else {
                    const mine = (this.myNode.id === clusterLeader.id) ? '(ME)' : '────';
                    const metaInfo = (preLeaderId === this.election.leaderId) ? ('─────' + mine) : (mine + '[New]');
                    const jobCount = clusterLeader.jobCount;
                    const bootTime = new Date(clusterLeader.bootTime).toISOString();
                    console.log(`     └──${metaInfo} [${clusterLeader.id}]-JotCount[${jobCount}]-BootTime[${bootTime}]`);
                }
                console.log(`◇ [WorkerNodes:${_.size(clusterWorks)}]`);
                if (_.size(clusterWorks) === 0) {
                    console.log(`     └─────────── No Workers`);
                }
                else {
                    _.forEach(_.orderBy(clusterWorks, ['bootTime'], ['asc']), (work) => {
                        const mine = (this.myNode.id === work.id) ? '(ME)' : '────';
                        const metaInfo = (_.indexOf(preWorkerIds, work.id) >= 0) ? ('─────' + mine) : (mine + '[New]');
                        const jobCount = work.jobCount;
                        const bootTime = new Date(work.bootTime).toISOString();
                        console.log(`     └──${metaInfo} [${work.id}]-JotCount[${jobCount}]-BootTime[${bootTime}]`);
                    });
                }
                console.log('');
            }
        }, 1000);
    }
    sendSyncReq() {
        const syncReq = {
            id: this.myNode.id
        };
        this.callback.send('syncReq', syncReq, (err) => {
            return;
        });
    }
    sendLeaderElection(leaderId) {
        const clusterElection = {
            id: this.myNode.id,
            leaderId: leaderId
        };
        this.callback.send('election', clusterElection, (err) => {
            return;
        });
    }
    sendSync(remove = false, meta = null) {
        if (this.sync.sendTimer) {
            clearTimeout(this.sync.sendTimer);
            this.sync.sendTimer = null;
        }
        // Restart timer
        this.sync.sendTimer = setTimeout(() => {
            this.sendSync();
        }, CLUSTER_SYNC_CYCLE);
        const clusetSyncInfo = {
            id: this.myNode.id,
            bootTime: this.myNode.bootTime,
            ttl: remove ? 0 : CLUSTER_SYNC_TTL,
            jobCount: this.callback.getJobCount()
        };
        if (meta) {
            clusetSyncInfo.meta = meta;
        }
        this.callback.send('sync', clusetSyncInfo, (err) => {
            return;
        });
    }
    sendSyncMeta(meta) {
        this.sendSync(false, meta);
    }
    removeNode() {
        this.sendSync(true);
    }
    getNodeToAssignJob() {
        this.syncRemoveExpired();
        if (this.myNode.isLeader) {
            const orderedNodes = _.orderBy(this.sync.nodeInfo, ['jobCount', 'bootTime'], ['asc', 'asc']);
            const nodeToAssign = _.find(orderedNodes, (nodeInfo) => {
                if (this.myNode.id === nodeInfo.id || _.indexOf(this.election.workerIds, nodeInfo.id) >= 0) {
                    return true;
                }
                else {
                    return false;
                }
            });
            return nodeToAssign;
        }
        else {
            return null;
        }
    }
    handleMessage(type, data) {
        if (type === 'syncReq') {
            this.sendSync();
        }
        else if (data) {
            if (type === 'sync') {
                const newClusterSyncInfo = data;
                if (newClusterSyncInfo.ttl > 0) {
                    const leaderNodeInfo = this.syncGetLeader();
                    const isWorkerClusterInfo = !!leaderNodeInfo && (leaderNodeInfo.bootTime < newClusterSyncInfo.bootTime);
                    this.syncAddInfo({
                        id: newClusterSyncInfo.id,
                        type: isWorkerClusterInfo ? 'worker' : 'leader',
                        bootTime: newClusterSyncInfo.bootTime,
                        expireTime: Date.now() + newClusterSyncInfo.ttl,
                        jobCount: newClusterSyncInfo.jobCount,
                    });
                }
                else {
                    this.syncRemoveInfo(newClusterSyncInfo.id);
                }
                this.syncElectionLeader();
            }
            else if (type === 'election') {
                const newClusterElectionInfo = data;
                let needNewClusterSyncInfo = false;
                if (this.myNode.id === newClusterElectionInfo.leaderId) {
                    if (this.myNode.isLeader) {
                        //Do Nothing
                    }
                    else { // if Worker
                        needNewClusterSyncInfo = true;
                        this.reset();
                    }
                }
                else {
                    if (this.myNode.isLeader) {
                        needNewClusterSyncInfo = true;
                    }
                    else { // if Worker
                        if (this.election.leaderId !== newClusterElectionInfo.leaderId) {
                            needNewClusterSyncInfo = true;
                            this.reset();
                        }
                    }
                }
                if (needNewClusterSyncInfo) {
                    // request new ClusterSync info
                    this.sendSyncReq();
                }
            }
        }
    }
    getNodeBootTime() {
        return this.myNode.bootTime;
    }
    getNodeId() {
        return this.myNode.id;
    }
    isLeaderNode() {
        return this.myNode.isLeader;
    }
    connect() {
        this.sendSyncReq();
    }
    disconnect() {
        this.reset();
    }
}
exports.Cluster = Cluster;
