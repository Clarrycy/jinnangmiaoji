// 由 src/jinnangdai/channel.ts 生成（node scripts/build-ts.js）；改源文件，不要改这里。
const entries_ = require("../core/entries");
const { ENTRIES, matchesAnyEntry } = entries_;
module.exports = Object.freeze({
  id: "jinnangdai",
  hostChannel: "micro",
  // 客户端版本：年份制数字 ＋ 英文代号（玩家看到的是「Zephyr 26.0.0」；更新清单与 asar 比对只认数字）
  shellVersion: "26.0.30",
  codename: "Zephyr",
  seedVersion: "1.7.1",
  title: "锦囊妙计",
  logName: "jinnangdai_launcher.log",
  entry: ENTRIES[0].entry,
  // app:// 导航等入口特有行为按当前入口决定，见 entries.js 的 appNavigation。
  handleAppNavigation: false,
  matchesUrl(url) {
    return matchesAnyEntry(url);
  }
});
