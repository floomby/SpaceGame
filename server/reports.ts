import { HydratedDocument } from "mongoose";
import { IUser, User } from "./dataModels";

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

export { generatePlayedIntervals, sumIntervals };
