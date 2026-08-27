"use strict";

class Mutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve(this.release.bind(this));
        return;
      }
      this.queue.push(resolve);
    });
  }

  release() {
    const next = this.queue.shift();
    if (next) next(this.release.bind(this));
    else this.locked = false;
  }
}

const mutexByAccount = new Map();

async function acquireEmailTriggerAccount(accountKey) {
  const key = String(accountKey || "").trim().toLowerCase();
  if (!key) throw new Error("Email trigger account key is required");
  let mutex = mutexByAccount.get(key);
  if (!mutex) {
    mutex = new Mutex();
    mutexByAccount.set(key, mutex);
  }
  const releaseMutex = await mutex.acquire();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseMutex();
    if (!mutex.locked && mutex.queue.length === 0) mutexByAccount.delete(key);
  };
}

module.exports = { acquireEmailTriggerAccount };
