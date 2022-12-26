import { HydratedDocument } from "mongoose";
import { maxDecimals } from "../src/geometry";
import { IUser, User } from "./dataModels";
import { GraphData, makeBarGraph } from "./graphs";

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

const totalPlayTimeByAllUsersInIntervals = async (intervals: [Date, Date][]) => {
  const users = await User.find({});
  let sums = intervals.map(() => 0);
  let playerAmounts: { name: string, amount: number }[] = [];
  for (const user of users) {
    let playerSum = 0;
    for (let i = 0; i < intervals.length; i++) {
      const playIntervals = generatePlayedIntervals(user);
      const intervalsInInterval = intervalsStartingInInterval(playIntervals, intervals[i][0], intervals[i][1]);
      const playTime = sumIntervals(intervalsInInterval);
      sums[i] += playTime;
      playerSum += playTime;
    }
    playerAmounts.push({ name: user.name, amount: playerSum });
  }

  return { sums, playerAmounts };
};

const dayLength = 1000 * 60 * 60 * 24;

const utcDateToInterval = (date: Date): [Date, Date] => {
  const start = new Date(date.getTime());
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + dayLength);
  return [start, end];
};  

const statEpoch = new Date(2022, 11, 20);

const sideBySideDivs = (left: string, right: string) => `
  <div style="display: flex; flex-direction: row; justify-content: left;">
    <div>${left}</div>
    <div>${right}</div>
  </div>
`;

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
  return sideBySideDivs(svg, playerAmounts.map(p => `${p.name}: ${maxDecimals(p.amount / 1000 / 60, 2)} minutes`).join("<br />"));
};

export { generatePlayedIntervals, sumIntervals, intervalsStartingInInterval, totalPlayTimeByAllUsersInIntervals, statEpoch, createReport };
