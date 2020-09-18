/*
 * Copyright 2017 Gitple Inc.
 */

'use strict';
let _ = require('lodash');

const CLUSTER_SYNC_CYCLE = 15 * 1000; // 15sec
const CLUSTER_SYNC_TTL = CLUSTER_SYNC_CYCLE + 2000; // 17sec
const CLUSTER_ELECTION_CYCLE = 60 * 1000; // 1min

export type ClusterMessageType = 'sync'|'syncReq'|'election';
export type ClusterSendCB = (type: ClusterMessageType, data: any, cb?: (err?: Error) => void) => void;

interface ClusterSyncReq {
  id: string; // nodeId of sender
}

export interface ClusterElection {
  id: string; // nodeId of sender
  leaderId: string;
}

export interface ClusterSendSync {
  id: string; // nodeId of sender
  bootTime: number;
  ttl: number;
  jobCount: number;
  meta?: any;
}

export interface ClusterSyncNode {
  id: string; // nodeId
  type: 'leader'|'worker';
  bootTime: number;
  expireTime: number;
  jobCount: number;
}

export class Cluster {
  private myNode: { id: string; bootTime: number; isLeader: boolean|null; };
  private sync: { nodeInfo: { [key: string]: ClusterSyncNode; }; sendTimer: NodeJS.Timer; electionTimer: NodeJS.Timer; };
  private election: { leaderId: string|null; workerIds: string[]; };
  private callback: { send: ClusterSendCB; getJobCount: () => number; };
  private intervalElectionTimer;

  constructor(nodeId: string, bootTime: number, getJobCount: () => number, send: ClusterSendCB) {
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
  }

  finalize() {
    this.reset(true);
  }

  private start() {
    if (this.intervalElectionTimer) {
      clearInterval(this.intervalElectionTimer);
      this.intervalElectionTimer = null;
    }

    this.intervalElectionTimer = setInterval(() => {
      if (this.myNode.isLeader) {
        this.sendLeaderElection(this.myNode.id);
      }
    }, CLUSTER_ELECTION_CYCLE);
  }

  private reset(isStopTimer: boolean = false) {
    if (isStopTimer) {
      if (this.intervalElectionTimer) {
        clearInterval(this.intervalElectionTimer);
        this.intervalElectionTimer = null;
      }

      if (this.sync.electionTimer) {
        clearTimeout(this.sync.electionTimer);
        this.sync.electionTimer = null;
      }

      if (this.sync.sendTimer) {
        clearTimeout(this.sync.sendTimer);
        this.sync.sendTimer = null;
      }
    }

    this.myNode.isLeader = null;
    this.sync.nodeInfo = {};
    this.election = {
      leaderId: null,
      workerIds: []
    };
  }

  private syncGetLeader(): ClusterSyncNode {
    this.syncRemoveExpired();
    return _.find(this.sync.nodeInfo, { type: 'leader' });
  }

  private syncGetWorkers(): ClusterSyncNode[] {
    this.syncRemoveExpired();
    return _.filter(this.sync.nodeInfo, { type: 'worker' });
  }

  private syncAddInfo(nodeInfo: ClusterSyncNode) {
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

  private syncResetLeader() {
    const leaderInfo: ClusterSyncNode = this.syncGetLeader();
    if (leaderInfo) {
      delete this.sync.nodeInfo[leaderInfo.id];
    }
  }

  private syncRemoveExpired() {
    const now = Date.now();

    _.forEach(this.sync.nodeInfo, (nodeInfo: ClusterSyncNode, nodeId: number) => {
      if (nodeInfo.expireTime < now) {
        // remove expired node
        delete this.sync.nodeInfo[nodeId];
      }
    });
  }

  private syncRemoveInfo(nodeId: string) {
    delete this.sync.nodeInfo[nodeId];
  }

  private syncElectionLeader() {
    if (this.sync.electionTimer) {
      return;
    }

    this.sync.electionTimer = setTimeout(() => {
      this.sync.electionTimer = null;

      const preLeaderId: string|null = this.election.leaderId;
      const preWorkerIds: string[] = this.election.workerIds;
      const clusterLeader: ClusterSyncNode = this.syncGetLeader();
      const clusterWorks: ClusterSyncNode[] = this.syncGetWorkers();

      this.election.leaderId = clusterLeader ? clusterLeader.id : null;
      this.election.workerIds = _.map(clusterWorks, 'id');

      if (this.myNode.id === this.election.leaderId) {
        this.myNode.isLeader = true;
      } else {
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
        const noLeader: boolean = _.isNil(this.election.leaderId) || !clusterLeader;

        console.log(`\n━━━━━━━━━ <Cluster Info: ${new Date().toISOString()}> ━━━━━━━━━`);
        console.log(`◆ [LeaderNode:${noLeader ? 0 : 1}]`);

        if (noLeader) {
          console.log(`     └─────────── [Error] No Leader`);
          this.sendSyncReq();
        } else {
          const mine: string = (this.myNode.id === clusterLeader.id) ? '(ME)' : '────';
          const metaInfo: string = (preLeaderId === this.election.leaderId) ? ('─────' + mine) : (mine + '[New]');
          const jobCount: number = clusterLeader.jobCount;
          const bootTime: string = new Date(clusterLeader.bootTime).toISOString();
          console.log(`     └──${metaInfo} [${clusterLeader.id}]-JotCount[${jobCount}]-StartTime[${bootTime}]`);
        }

        console.log(`◇ [WorkerNodes:${_.size(clusterWorks)}]`);

        if (_.size(clusterWorks) === 0) {
          console.log(`     └─────────── No Workers`);
        } else {
          _.forEach(_.orderBy(clusterWorks, ['bootTime'], ['asc']), (work: ClusterSyncNode) => {
            const mine: string = (this.myNode.id === work.id) ? '(ME)' : '────';
            const metaInfo: string = (_.indexOf(preWorkerIds, work.id) >= 0) ? ('─────' + mine) : (mine + '[New]');
            const jobCount: number = work.jobCount;
            const bootTime: string = new Date(work.bootTime).toISOString();
            console.log(`     └──${metaInfo} [${work.id}]-JotCount[${jobCount}]-StartTime[${bootTime}]`);
          });
        }

        console.log('');
      }
    }, 1000);
  }

  private sendSyncReq() {
    const syncReq: ClusterSyncReq = {
      id: this.myNode.id
    };

    this.callback.send('syncReq', syncReq, (err?: Error) => {
      return;
    });
  }

  private sendLeaderElection(leaderId: string) {
    const clusterElection: ClusterElection = {
      id: this.myNode.id,
      leaderId: leaderId
    };

    this.callback.send('election', clusterElection, (err?: Error) => {
      return;
    });
  }

  private sendSync(remove: boolean = false, meta: any = null) {
    if (this.sync.sendTimer) {
      clearTimeout(this.sync.sendTimer);
      this.sync.sendTimer = null;
    }

    // Restart timer
    this.sync.sendTimer = setTimeout(() => {
      this.sendSync();
    }, CLUSTER_SYNC_CYCLE);

    const clusetSyncInfo: ClusterSendSync = {
      id: this.myNode.id,
      bootTime: this.myNode.bootTime,
      ttl: remove ? 0 : CLUSTER_SYNC_TTL,
      jobCount: this.callback.getJobCount()
    };

    if (meta) {
      clusetSyncInfo.meta = meta;
    }

    this.callback.send('sync', clusetSyncInfo, (err?: Error) => {
      return;
    });
  }

  sendSyncMeta(meta: any) {
    this.sendSync(false, meta);
  }

  removeNode() {
    this.sendSync(true);
  }

  getNodeToAssignJob(): ClusterSyncNode {
    this.syncRemoveExpired();

    if (this.myNode.isLeader) {
      const orderedNodes: ClusterSyncNode = _.orderBy(this.sync.nodeInfo, ['jobCount', 'bootTime'], ['asc', 'asc']);
      const nodeToAssign: ClusterSyncNode = _.find(orderedNodes, (nodeInfo: ClusterSyncNode) => {
        if (this.myNode.id === nodeInfo.id || _.indexOf(this.election.workerIds, nodeInfo.id) >= 0) {
          return true;
        } else {
          return false;
        }
      });
      return nodeToAssign;
    } else {
      return null;
    }
  }

  handleMessage(type: ClusterMessageType, data: ClusterSendSync|ClusterElection|null) {
    if (type === 'syncReq') {
      this.sendSync();
    } else if (data) {
      if (type === 'sync') {
        const newClusterSyncInfo: ClusterSendSync = <ClusterSendSync>data;

        if (newClusterSyncInfo.ttl > 0) {
          const leaderNodeInfo: ClusterSyncNode = this.syncGetLeader();
          const isWorkerClusterInfo: boolean = !!leaderNodeInfo && (leaderNodeInfo.bootTime < newClusterSyncInfo.bootTime);

          this.syncAddInfo({
            id: newClusterSyncInfo.id,
            type: isWorkerClusterInfo ? 'worker' : 'leader',
            bootTime: newClusterSyncInfo.bootTime,
            expireTime: Date.now() + newClusterSyncInfo.ttl,
            jobCount: newClusterSyncInfo.jobCount,
          });
        } else {
          this.syncRemoveInfo(newClusterSyncInfo.id);
        }

        this.syncElectionLeader();
      } else if (type === 'election') {
        const newClusterElectionInfo: ClusterElection = <ClusterElection>data;
        let needNewClusterSyncInfo: boolean = false;

        if (this.myNode.id === newClusterElectionInfo.leaderId) {
          if (this.myNode.isLeader) {
            //Do Nothing
          } else { // if Worker
            needNewClusterSyncInfo = true;
            this.reset();
          }
        } else {
          if (this.myNode.isLeader) {
            needNewClusterSyncInfo = true;
          } else { // if Worker
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

  setNodeBootTime(bootTime: number) {
    this.myNode.bootTime = bootTime;
  }

  getNodeBootTime(): number {
    return this.myNode.bootTime;
  }

  getNodeId(): string {
    return this.myNode.id;
  }

  isLeaderNode(): boolean {
    return this.myNode.isLeader;
  }

  connect() {
    this.start();
    this.sendSyncReq();
  }

  disconnect() {
    this.reset(true);
  }
}