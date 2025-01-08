/**
 * @since 2025/01/07
 * @author ThinhHV <thinh@thinhhv.com>
 * @description Filter peers for qBittorrent
 * @copyright (c) 2025 ThinhHV Platform
 */

import getopt, { type Config } from "./getopt.ts";

// =====================================
// CONFIGURATION
// =====================================
export const defaultBlockList =
  "Thunder,XL0012,BitComet,XunLei,Xfplay,danda,anacrolix,devel,dt/torrent,unknown";
export const options = getopt({
  url: {
    key: "u",
    description: "URL of qBittorrent without 'http://' or 'https://'",
    default: process.env.URL || "127.0.0.1",
    args: 1,
  },
  port: {
    key: "p",
    description: "Port of qBittorrent",
    default: process.env.PORT || 8080,
    args: 1,
  },
  username: {
    key: "U",
    description: "User to auth qBittorrent.",
    default: process.env.USERNAME || false,
    args: 1,
  },
  password: {
    key: "P",
    description: "Password to auth qBittorrent. Leave blank to disable auth.",
    default: process.env.PASSWORD || false,
    args: 1,
  },
  ssl: {
    key: "s",
    description: 'Use https protocol ("http" by default)',
    default: process.env.SSL === "true" || false,
  },
  "time-interval": {
    key: "t",
    description: "Time interval in seconds between filter checks",
    default: process.env.TIME_INTERVAL || 10,
    args: 1,
  },
  "time-clear": {
    key: "c",
    description:
      "Time interval in hours to clear banned peer list, 0 = disable",
    default: process.env.TIME_CLEAR || "0",
    args: 1,
  },
  "clear-immediately": {
    key: "ci",
    description: "Clear immediately banned peer list",
    default: process.env.CLEAR_IMMEDIATELY === "true" || false,
  },
  watch: {
    key: "w",
    description: "Watch all peers (output to sdtout)",
    default: process.env.WATCH === "true" || false,
  },
  "block-clients": {
    key: "x",
    description: "Blocks clients unconditionally regardless of leeching status",
    default: process.env.BLOCK_CLIENTS === "true" || false,
  },
  "block-list": {
    key: "b",
    description: "Blocks clients conditionally with wildcards",
    default: process.env.BLOCK_LIST || defaultBlockList,
    args: "*",
  },
  delimiter: {
    description: "Delimiter marks the beginning or end of a wildcard of list",
    default: process.env.DELIMITER || ",",
    args: 1,
  },
  dry: {
    description: "Dry run for test",
    default: process.env.DRY === "true" || false,
  },
  debug: {
    description: "Print detail error logs",
    default: process.env.DEBUG === "true" || false,
  },
});

export const delay = async (ms) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const country2flag = (countryCode) => {
  return countryCode
    .toUpperCase()
    .split("")
    .map((char) => String.fromCodePoint(char.charCodeAt(0) + 0x1f1a5))
    .join("");
};

// =====================================
// FILTER
// =====================================
export class Filter {
  private cookie = undefined;
  private baseURL = "";
  private options: Config = {};
  private commonHeaders = {};
  private bannedIPs = "";

  constructor(options) {
    this.options = options;
    if (typeof options["block-list"] === "string") {
      this.options["block-list"] = options["block-list"]
        .split(options.delimiter)
        .map((e) => e.trim());
    }
    this.reset();
  }

  // Reset states
  async reset() {
    this.cookie = undefined;
    this.baseURL = `${this.options.ssl ? "https" : "http"}://${
      this.options.url
    }:${this.options.port}`;
    this.commonHeaders = {
      Host: `${this.options.url}:${this.options.port}`,
      Origin: this.baseURL,
      Pragma: "no-cache",
      Referer: this.baseURL + "/",
      "Accept-Encoding": "gzip, deflate, br",
    };
    this.bannedIPs = "";
  }

  // Initialize
  async init() {
    // Get cookie
    if (this.options.username && this.options.password) {
      await this.getCookie();
    } else {
      this.logging("No auth required. Ignored get cookie.");
    }
    // Fetching bannedIPs
    this.logging("Fetching banned IPs...");
    await this.getBannedIPs();
  }

  // Get cookie
  async getCookie() {
    // Get cookie from server
    const res = await this.POST(
      `${this.baseURL}/api/v2/auth/login`,
      `username=${this.options.username}&password=${this.options.password}`
    ).then((res) => res.headers.get("set-cookie"));
    if (res) {
      this.cookie = res.match(/(.*?);/)[1];
      this.logging("Cookie:", this.cookie);
    }
  }

  // Get bannedIPs
  async getBannedIPs() {
    let retry = true;
    do {
      const configs = await this.getConfigs();
      if (configs) {
        retry = false;
        this.bannedIPs = configs.banned_IPs;
        this.logging(
          "Total",
          this.bannedIPs
            .trim()
            .split("\n")
            .filter((e) => !!e).length,
          "IPs banned."
        );
        return this.bannedIPs;
      } else {
        this.logging("Get banned IPs failed. Retrying in 5s...");
        await delay(5000);
      }
    } while (retry);
  }

  // Get config
  async getConfigs() {
    return await this.GET(`${this.baseURL}/api/v2/app/preferences`);
  }

  // Update config
  async setConfigs(configs) {
    if (!this.options.dry) {
      await this.POST(
        `${this.baseURL}/api/v2/app/setPreferences`,
        `json=${JSON.stringify(configs)}`
      );
    }
    return;
  }

  // Get all torrents
  async getAllTorrents() {
    const allTorrents = await this.GET(`${this.baseURL}/api/v2/sync/maindata`);
    if (this.options.debug) {
      this.logging(
        "Total",
        Object.keys(allTorrents?.torrents || {}).length,
        "torrents."
      );
    }
    return (allTorrents?.torrents || {}) as any;
  }

  // Get peers of a torrent
  async getPeers(torrentHash) {
    const peers = await this.GET(
      `${this.baseURL}/api/v2/sync/torrentPeers?hash=${torrentHash}`
    );
    return peers;
  }

  // Ban a list of peers
  async banPeers(peers: any[] = []) {
    const log = () => {
      peers.forEach(([id, peer]) => {
        this.logging(
          "Banned",
          id,
          peer.connection,
          peer.client,
          peer.peer_id_client,
          country2flag(peer.country_code),
          peer.country
        );
      });
    };
    const result =
      this.options.dry ||
      (await this.POST(
        `${this.baseURL}/api/v2/transfer/banPeers`,
        `peers=${peers.map(([id]) => id).join("|")}`
      ).then(() => true));
    if (result) {
      log();
    }
  }

  // Clear banned peers
  async clearBannedPeers() {
    if (!this.options.dry) {
      await this.POST(`${this.baseURL}/api/v2/torrents/clearBannedPeers`);
    }
    this.bannedIPs = "";
    this.logging("Cleared banned peers.");
  }

  // Filter all active torrents
  async filter() {
    const torrents = await this.getAllTorrents();
    const activeTorrents: any[][] = Object.entries(torrents).filter(
      ([, torrent]: any[]) => torrent.num_leechs > 0
    );
    if (this.options.debug) {
      this.logging("Monitoring", activeTorrents.length, "active torrents.");
    }
    let totalPeers = 0;
    const peersToBanned: any[][] = [];
    for (const [hash, torrent] of activeTorrents) {
      const peers = await this.getPeers(hash);
      if (peers) {
        Object.entries(peers.peers).forEach(async ([id, peer]: any[]) => {
          if (peer.client) {
            totalPeers++;
          }
          if (
            peer.client &&
            (this.options["block-list"] as any[]).findIndex(
              (regExp) =>
                !!peer.client.match(new RegExp(regExp, "gmi")) ||
                !!peer.peer_id_client.match(new RegExp(regExp, "gmi"))
            ) > 0
          ) {
            peersToBanned.push([id, peer]);
          }
        });
      } else {
        this.logging(torrent.name, "Get list of peers failed");
      }
    }
    if (this.options.debug) {
      this.logging("Total", totalPeers, "peers filtered.");
    }
    if (peersToBanned.length) {
      await this.banPeers(peersToBanned);
      await this.setConfigs({
        banned_IPs: [
          ...this.bannedIPs.split("\n").filter((e) => !!e),
          ...peersToBanned
            .map(([, peer]) => peer.ip)
            .filter((e) => !this.bannedIPs.includes(e)),
        ].join("\n"),
      });
      await this.getBannedIPs();
    }
  }

  async GET(url: string, retry = 1) {
    return await fetch(url, {
      headers: {
        ...this.commonHeaders,
        Accept: "application/json",
        Cookie: this.cookie,
      },
    } as any)
      .then(async (res) => {
        if (res.status === 403) {
          if (this.options.username && this.options.password) {
            // IP banned
            const body = await res.text();
            if (body.includes("Your IP address has been banned")) {
              this.logging(body);
              this.logging(
                "Please check username/password, restart qBittorrent and retry."
              );
              process.exit(1);
            }
            // Fetching new cookie
            if (!res.url.includes("/login") && retry < 3) {
              this.logging("Cookie expired. Fetching new cookie...");
              await this.getCookie();
              return await this.GET(url, ++retry);
            } else {
              this.logging(
                "The username or password are not correct. Exiting..."
              );
              process.exit(1);
            }
          } else {
            this.logging(
              "qBittorrent need auth but the username and password are not configured. Exiting..."
            );
            process.exit(1);
          }
        }
        if (res.status !== 200) {
          if (this.options.debug) {
            this.logging(res);
            this.logging(await res.text());
          }
          return;
        }
        return await res.json();
      })
      .catch(this.logging);
  }

  async POST(url: string, data?: any, retry = 1) {
    return await fetch(url, {
      method: "POST",
      headers: {
        ...this.commonHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: this.cookie,
      },
      body: data,
    } as any)
      .then(async (res) => {
        if (res.status === 403) {
          if (this.options.username && this.options.password) {
            // IP banned
            const body = await res.text();
            if (body.includes("Your IP address has been banned")) {
              this.logging(body);
              this.logging(
                "Please check username/password, restart qBittorrent and retry."
              );
              process.exit(1);
            }
            // Fetching new cookie
            if (!res.url.includes("/login") && retry < 3) {
              this.logging("Cookie expired. Fetching new cookie...");
              await this.getCookie();
              return await this.POST(url, data, ++retry);
            } else {
              this.logging(
                "The username or password are not correct. Exiting..."
              );
              process.exit(1);
            }
          } else {
            this.logging(
              "qBittorrent need auth but the username and password are not configured. Exiting..."
            );
            process.exit(1);
          }
        }
        return res;
      })
      .catch(this.logging);
  }

  // Logging
  logging(...msg) {
    if (msg[0] instanceof Error && !(this?.options || options).debug) {
      msg = ["[ERROR]", (msg[0].cause as any)?.message || msg[0].message];
    }
    console.log(`[${new Date().toISOString()}]`, ...msg);
  }
}

// =====================================
// MAIN THREAD
// =====================================
// Global variables
let interval: any = null;
let lastClear = new Date();
// Main
export const main = async () => {
  // Initialize
  const filter = new Filter(options);
  filter.logging("Start filter with options\n", options);

  // Clear immediately banned peer list
  if (options!["clear-immediately"]) {
    await filter.clearBannedPeers();
  }

  // Initialize
  await filter.init();

  // Run immediately on initial filter
  await filter.filter();
  await delay(+options!["time-interval"] * 1000);

  // Start interval
  interval = setInterval(() => {
    filter.filter();
    if (
      +options!["time-clear"] > 0 &&
      new Date() >
        new Date(lastClear.getTime() + +options!["time-clear"] * 60 * 60 * 1000)
    ) {
      filter.clearBannedPeers();
      lastClear = new Date();
    }
  }, +options!["time-interval"] * 1000);
};
main();

// =====================================
// EXIT
// =====================================
process.on("SIGINT", () => {
  clearInterval(interval);
  console.log("Exited.");
  process.exit();
});
