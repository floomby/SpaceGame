import { HydratedDocument } from "mongoose";
import { maxDecimals } from "../src/geometry";
import { IUser, User } from "./dataModels";
import { GraphData, makeBarGraph } from "./graphs";
import { WebSocketConnection } from "./logging";
import { sideBySideDivs, stackedDivs } from "../src/dialogs/helpers";

const defaultPlayTimeIfUndefined = 1000 * 60;

const generatePlayedIntervals = (user: HydratedDocument<IUser>) => {
  const intervals: [Date, Date][] = [];
  const logins = user.loginTimes;
  const logoffs = user.logoffTimes;
  for (let i = 0; i < logins.length; i++) {
    // Find the first logoff after this login
    let j = 0;
    for (; j < logoffs.length; j++) {
      if (logins[i] < logoffs[j]) {
        break;
      }
    }
    let end = logins[i + 1];
    if (end && logoffs[j] && end > logoffs[j]) {
      end = logoffs[j];
    }
    if (!end) {
      end = logoffs[j];
    }
    if (!end) {
      end = new Date(logins[i].getTime() + defaultPlayTimeIfUndefined);
    }
    intervals.push([logins[i], end]);
  }
  return intervals;
};

const sumIntervals = (intervals: [Date, Date][]) => {
  let sum = 0;
  for (const interval of intervals) {
    sum += interval[1].getTime() - interval[0].getTime();
  }
  return sum;
};

const intervalsStartingInInterval = (intervals: [Date, Date][], start: Date, end: Date) => {
  const result: [Date, Date][] = [];
  for (const interval of intervals) {
    if (interval[0] >= start && interval[0] <= end) {
      result.push(interval);
    }
  }
  return result;
};

const playerTable = (playerAmounts: { name: string; amount: number; loginCount: number }[]) => {
  const rows = playerAmounts.map((p) => `<tr><td>${p.name}</td><td>${maxDecimals(p.amount / 1000 / 60, 2)}</td><td>${p.loginCount}</td></tr>`);
  return `<table><tr><th>Name</th><th>Playtime (minutes)</th><th>Login count</th></tr>${rows.join("")}</table>`;
};

const wrapReportHTML = (content: string) => `
<!DOCTYPE html>
<html>
  <head>
    <title>Space Game Report</title>
    <link rel="stylesheet" href="report.css" />
  </head>
  <body>
    ${content}
  </body>
</html>
`;

const totalPlayTimeByAllUsersInIntervals = async (intervals: [Date, Date][]) => {
  const users = await User.find({});
  let sums = intervals.map(() => 0);
  let playerAmounts: { name: string; amount: number; loginCount: number }[] = [];
  for (const user of users) {
    let playerSum = 0;
    for (let i = 0; i < intervals.length; i++) {
      const playIntervals = generatePlayedIntervals(user);
      const intervalsInInterval = intervalsStartingInInterval(playIntervals, intervals[i][0], intervals[i][1]);
      const playTime = sumIntervals(intervalsInInterval);
      sums[i] += playTime;
      playerSum += playTime;
    }
    playerAmounts.push({ name: user.name, amount: playerSum, loginCount: user.loginCount });
  }

  return { sums, playerAmounts };
};

const bouncedTallySince = async (date: Date) => {
  const bouncedCount = await WebSocketConnection.countDocuments({ date: { $gt: date }, playerId: null });
  const totalCount = await WebSocketConnection.countDocuments({ date: { $gt: date } });
  return { bouncedCount, totalCount };
};

const bouncedHTML = async (date: Date) => {
  const { bouncedCount, totalCount } = await bouncedTallySince(date);
  return `<div>Bounced connections since ${date.toDateString()}: ${bouncedCount} / ${totalCount} (${maxDecimals(
    (bouncedCount / totalCount) * 100,
    2
  )}%)</div>`;
};

const uniqueIPsSince = async (date: Date) => {
  return (await WebSocketConnection.distinct("ipAddr", { date: { $gt: date } })).length;
};

const uniqueIPsHTML = async (date: Date) => {
  const count = await uniqueIPsSince(date);
  return `<div>Unique IPs since ${date.toDateString()}: ${count}</div>`;
};

const dayLength = 1000 * 60 * 60 * 24;

const utcDateToInterval = (date: Date): [Date, Date] => {
  const start = new Date(date.getTime());
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + dayLength);
  return [start, end];
};

const statEpoch = new Date(2022, 11, 24);

const createReport = async (epoch: Date) => {
  const now = new Date();
  const intervals: [Date, Date][] = [];
  let current = epoch;
  do {
    const interval = utcDateToInterval(current);
    current = interval[1];
    intervals.push(interval);
  } while (current < now);
  const { sums, playerAmounts } = await totalPlayTimeByAllUsersInIntervals(intervals);
  playerAmounts.sort((a, b) => b.amount - a.amount);
  const data: GraphData[] = [];
  for (let i = 0; i < intervals.length; i++) {
    data.push({
      value: sums[i],
      tooltip: `${intervals[i][0].toDateString()} - ${intervals[i][1].toDateString()}: ${maxDecimals(sums[i] / 1000 / 60, 2)} minutes`,
    });
  }
  const svg = makeBarGraph(data, "Date", "Minutes", "Play Time");
  return wrapReportHTML(sideBySideDivs([stackedDivs([svg, await bouncedHTML(epoch), await uniqueIPsHTML(epoch)]), playerTable(playerAmounts)]));
};

export { generatePlayedIntervals, sumIntervals, intervalsStartingInInterval, totalPlayTimeByAllUsersInIntervals, statEpoch, createReport };
